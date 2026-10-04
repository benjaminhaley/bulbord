// Acting on an admin's free-text Pipeline Review note (2026-09-28). Before
// this, a Retry note was only ever threaded into (a) the text-check retry,
// which runs solely for checks that are *already failing*, and (b) the image
// search — so a note asking for anything else ("this should be one event per
// film, not a generic monthly listing") was silently dropped, and the toast
// still said "Retried — now passing". Ben: "anytime it can't complete the
// suggested note it should share that it wasn't able to explicitly and an
// explanation of why."
//
// So a note is now read first, on its own terms, by one web-search-enabled
// call that decides which of four things it's asking for and does the
// research for it:
//   - split: the event is really a series/umbrella listing — replace it with
//     one real event per dated occurrence (found via search/fetch)
//   - edit: corrected field values (title/description/location/date/time/…)
//   - image: the note is about the photo — the existing image re-search
//     (which already takes the note) handles it
//   - cannot: it can't be done, with an honest explanation why
// The same call is reused by resourcing.ts to auto-split a candidate the
// extractor flags as an umbrella series, so the pipeline fixes that shape
// itself going forward rather than waiting for a reviewer to ask again.
import { and, eq, isNull } from 'drizzle-orm'
import type Anthropic from '@anthropic-ai/sdk'

import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { todayInChicago } from '../dates.js'
import { filterFamilyRelevantCandidates } from './candidate-validation.js'
import { AUDIENCE_RELEVANCE_RULES } from './extraction-filters.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'
import { getRetryStrategiesPromptBlock } from './retry-strategies.js'

const CALL_TIMEOUT_MS = 180_000
// A server-tool loop can pause mid-turn (stop_reason "pause_turn"); resuming
// is just re-sending the conversation with the paused turn appended.
const MAX_CONTINUATIONS = 3
// A real series (a month of screenings, a season of classes) rarely needs
// more; anything bigger is more likely a misread than a real split.
export const MAX_SPLIT_OCCURRENCES = 40

export interface NoteEventInput {
  title: string
  description: string | null
  startDate: string
  startTime: string | null
  allDay: boolean
  address: string | null
  locationName: string | null
  sourceUrl: string | null
}

export interface NoteOccurrence {
  title: string
  description?: string
  startDate: string
  startTime?: string
  allDay: boolean
  address?: string
  locationName?: string
  sourceUrl?: string
}

export interface NoteFieldEdits {
  title?: string
  description?: string
  locationName?: string
  address?: string
  startDate?: string
  startTime?: string | null
  allDay?: boolean
  sourceUrl?: string
}

export type NoteDecision =
  | { action: 'split'; explanation: string; occurrences: NoteOccurrence[] }
  | { action: 'edit'; explanation: string; fields: NoteFieldEdits }
  | { action: 'image'; explanation: string }
  | { action: 'cannot'; explanation: string }

const SYSTEM_PROMPT = `You act on a reviewer's note about one event listing in a family/community events app for Nettelhorst School families (pre-K through 8th grade) in Chicago. The note is an instruction about what's wrong with the listing. Work out what it's asking for, do the research needed (web search, and fetch the actual pages — the listing's own source_url, the venue's site, the specific program's page), and respond with exactly one decision:

- "split": the listing is really several distinct events lumped together (a film series, a month of programs, a season of classes, a generic umbrella listing) and the note wants them separate. Find every individual upcoming occurrence (on or after "today") with its real date and start time, and give each its own specific title (e.g. the film's name, "Music Box of Horrors: The Shining"), a one-sentence description of that specific occurrence, and, when one exists, the URL of that occurrence's own page as source_url. Only include occurrences you actually found published — never invent a date or time. ${AUDIENCE_RELEVANCE_RULES.trim()} If you can't find the individual occurrences, choose "cannot" instead and say where you looked and what was missing.
- "edit": the note asks for corrected facts about this one event (title, description, venue name, address, date, time, all-day, source URL). Give only the fields that change, with values you verified.
- "image": the note is only about the photo. (A separate image search, which also reads the note, will handle it.)
- "cannot": you can't do what the note asks — the information isn't published, the pages wouldn't load, or it asks for something outside these options. Say plainly why and what you tried.

"explanation" is always required: one or two plain sentences, written to the reviewer, saying what you did (e.g. "Split into 6 screenings found on musicboxtheatre.com's October calendar") or why you couldn't.

Times are Chicago local wall-clock. Respond with ONLY a JSON object as your final message, no markdown fences:
{"action": "split"|"edit"|"image"|"cannot", "explanation": string,
 "occurrences"?: [{"title": string, "description"?: string, "start_date": "YYYY-MM-DD", "start_time"?: "HH:MM", "all_day": boolean, "location_name"?: string, "address"?: string, "source_url"?: string}],
 "fields"?: {"title"?: string, "description"?: string, "location_name"?: string, "address"?: string, "start_date"?: "YYYY-MM-DD", "start_time"?: "HH:MM" | null, "all_day"?: boolean, "source_url"?: string}}`

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

function parseOccurrence(raw: Record<string, unknown>, today: string): NoteOccurrence | null {
  const title = str(raw.title)
  const startDate = str(raw.start_date)
  if (!title || !startDate || !DATE_RE.test(startDate) || startDate < today) return null
  const startTime = str(raw.start_time)
  const hasTime = startTime !== undefined && TIME_RE.test(startTime)
  return {
    title,
    description: str(raw.description),
    startDate,
    startTime: hasTime ? startTime : undefined,
    // A time wins over a stray all_day: true — the two must agree (see
    // checkTimeQuality), and a stated time is the more specific fact.
    allDay: !hasTime,
    locationName: str(raw.location_name),
    address: str(raw.address),
    sourceUrl: str(raw.source_url),
  }
}

// Exported for tests: turns the model's raw JSON into a decision, downgrading
// anything unusable (a split with no valid occurrences, an edit with no
// fields) to an honest "cannot" rather than a silent no-op.
export function parseNoteDecision(raw: unknown, today: string): NoteDecision {
  if (!raw || typeof raw !== 'object') return { action: 'cannot', explanation: 'The note could not be interpreted (no usable response).' }
  const r = raw as Record<string, unknown>
  const explanation = str(r.explanation) ?? ''

  if (r.action === 'split') {
    const occurrences = (Array.isArray(r.occurrences) ? r.occurrences : [])
      .map((o) => (o && typeof o === 'object' ? parseOccurrence(o as Record<string, unknown>, today) : null))
      .filter((o): o is NoteOccurrence => o !== null)
      .slice(0, MAX_SPLIT_OCCURRENCES)
    if (occurrences.length < 2) {
      return { action: 'cannot', explanation: `Couldn't split it: found ${occurrences.length === 0 ? 'no' : 'only one'} upcoming dated occurrence. ${explanation}`.trim() }
    }
    return { action: 'split', explanation, occurrences }
  }

  if (r.action === 'edit') {
    const f = (r.fields && typeof r.fields === 'object' ? r.fields : {}) as Record<string, unknown>
    const fields: NoteFieldEdits = {}
    if (str(f.title)) fields.title = str(f.title)
    if (str(f.description)) fields.description = str(f.description)
    if (str(f.location_name)) fields.locationName = str(f.location_name)
    if (str(f.address)) fields.address = str(f.address)
    if (str(f.source_url)) fields.sourceUrl = str(f.source_url)
    const date = str(f.start_date)
    if (date && DATE_RE.test(date)) fields.startDate = date
    const time = str(f.start_time)
    if (time && TIME_RE.test(time)) {
      fields.startTime = time
      fields.allDay = false
    } else if (f.all_day === true || f.start_time === null) {
      fields.startTime = null
      fields.allDay = true
    }
    if (Object.keys(fields).length === 0) return { action: 'cannot', explanation: `No field changes came back. ${explanation}`.trim() }
    return { action: 'edit', explanation, fields }
  }

  if (r.action === 'image') return { action: 'image', explanation }
  return { action: 'cannot', explanation: explanation || 'The note could not be acted on.' }
}

// The decision as the web app receives it (snake_case, like every other
// event payload): POST /events/interpret-retry-note.
export function serializeNoteDecision(decision: NoteDecision) {
  if (decision.action === 'edit') {
    const f = decision.fields
    return {
      action: decision.action,
      explanation: decision.explanation,
      fields: {
        title: f.title,
        description: f.description,
        location_name: f.locationName,
        address: f.address,
        start_date: f.startDate,
        start_time: f.startTime,
        all_day: f.allDay,
        source_url: f.sourceUrl,
      },
    }
  }
  if (decision.action === 'split') {
    return {
      action: decision.action,
      explanation: decision.explanation,
      occurrences: decision.occurrences.map((o) => ({
        title: o.title,
        description: o.description,
        start_date: o.startDate,
        start_time: o.startTime,
        all_day: o.allDay,
        location_name: o.locationName,
        address: o.address,
        source_url: o.sourceUrl,
      })),
    }
  }
  return { action: decision.action, explanation: decision.explanation }
}

// Never throws — any failure comes back as an explained "cannot", which is
// the whole point: a note must never be dropped without saying so.
export async function interpretReviewNote(event: NoteEventInput, note: string, sourceText?: string): Promise<NoteDecision> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return { action: 'cannot', explanation: 'No Claude API key is configured, so the note could not be read.' }

  const today = todayInChicago()
  const system = SYSTEM_PROMPT + (await getRetryStrategiesPromptBlock())
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: JSON.stringify({
        today,
        note,
        event: {
          title: event.title,
          description: event.description,
          start_date: event.startDate,
          start_time: event.startTime,
          all_day: event.allDay,
          location_name: event.locationName,
          address: event.address,
          source_url: event.sourceUrl,
        },
        source_page_text: sourceText ? sourceText.slice(0, 12_000) : null,
      }),
    },
  ]

  try {
    let message: Anthropic.Message | null = null
    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      message = await anthropic.messages.create(
        {
          model: 'claude-opus-5',
          max_tokens: 16000,
          output_config: { effort: 'medium' },
          system,
          tools: [
            { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
            { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 },
          ],
          messages,
        },
        { timeout: CALL_TIMEOUT_MS, maxRetries: 1 },
      )
      if (message.stop_reason !== 'pause_turn') break
      messages.push({ role: 'assistant', content: message.content })
    }
    if (!message) return { action: 'cannot', explanation: 'The note could not be read (no response).' }
    if (message.stop_reason === 'refusal') return { action: 'cannot', explanation: 'The model declined to act on this note.' }
    if (message.stop_reason === 'pause_turn') return { action: 'cannot', explanation: 'The research ran out of steps before reaching an answer. Try a more specific note (e.g. name the page that lists the dates).' }

    const block = [...message.content].reverse().find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return { action: 'cannot', explanation: 'The research finished without an answer.' }
    // The final text can carry a sentence of preamble before the JSON.
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    const json = start >= 0 && end > start ? raw.slice(start, end + 1) : stripJsonCodeFence(raw)
    return parseNoteDecision(JSON.parse(json), today)
  } catch (err) {
    return { action: 'cannot', explanation: `Reading the note failed: ${err instanceof Error ? err.message : 'unknown error'}.` }
  }
}

export function occurrenceToCandidate(o: NoteOccurrence, parent: { sourceUrl: string; address: string | null; locationName: string | null }): CandidateEvent {
  return {
    title: o.title,
    description: o.description,
    startDate: o.startDate,
    startTime: o.startTime,
    allDay: o.allDay,
    address: o.address ?? parent.address ?? undefined,
    locationName: o.locationName ?? parent.locationName ?? undefined,
    sourceUrl: o.sourceUrl ?? parent.sourceUrl,
    status: 'approved',
  }
}

// Replaces one live event with its individual occurrences. The original is
// soft-deleted *first* so ingestEvents()'s same-day fuzzy dedup doesn't
// mistake the new "Music Box of Horrors: <film>" rows for duplicates of the
// umbrella listing — and restored if nothing new actually got inserted, so a
// failed split never loses the event.
export async function splitEvent(
  eventId: string,
  occurrences: NoteOccurrence[],
  actorId: string,
  note: string,
): Promise<{ inserted: number; skipped: number; filteredOut: number } | { error: string }> {
  const [original] = await db
    .select({ title: events.title, sourceId: events.sourceId, sourceUrl: events.sourceUrl, address: events.address, locationName: events.locationName })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
    .limit(1)
  if (!original) return { error: 'The event no longer exists.' }
  if (!original.sourceId || !original.sourceUrl) {
    return { error: 'It was posted by a member rather than sourced, and splitting only works for sourced events so far.' }
  }

  await db.update(events).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(events.id, eventId))
  // Same second-pass relevance check every sourced candidate gets — a split
  // can surface occurrences (an adults-only late show) the umbrella listing
  // never showed individually.
  const { kept: candidates, rejected } = await filterFamilyRelevantCandidates(
    occurrences.map((o) => occurrenceToCandidate(o, { ...original, sourceUrl: original.sourceUrl as string })),
  )
  let result: { inserted: number; skipped: number }
  try {
    result = await ingestEvents(candidates, { sourceId: original.sourceId, actor: actorId, filteredOut: rejected })
  } catch (err) {
    await db.update(events).set({ deletedAt: null, updatedAt: new Date() }).where(eq(events.id, eventId))
    return { error: `Adding the new events failed: ${err instanceof Error ? err.message : 'unknown error'}.` }
  }
  if (result.inserted === 0) {
    await db.update(events).set({ deletedAt: null, updatedAt: new Date() }).where(eq(events.id, eventId))
    return {
      error: rejected.length > 0 && candidates.length === 0
        ? `All ${rejected.length} occurrences found were filtered out as not family-relevant, so nothing was split.`
        : `All ${result.skipped} occurrences found already exist as events, so nothing was split.`,
    }
  }

  await db.insert(eventsLog).values({
    actor: actorId,
    action: 'event_split_by_review_note',
    metadata: { eventId, title: original.title, note, inserted: result.inserted, skipped: result.skipped, filteredOut: rejected.length, occurrences: candidates.map((c) => ({ title: c.title, startDate: c.startDate, startTime: c.startTime })) },
  })
  return { ...result, filteredOut: rejected.length }
}
