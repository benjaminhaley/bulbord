import * as cheerio from 'cheerio'
import { and, eq, isNull } from 'drizzle-orm'

import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import { db } from '../db/client.js'
import { todayInChicago } from '../dates.js'
import { eventSources } from '../db/schema.js'
import { resendClient } from '../newsletter/mailer.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Feedback #115 (2026-09-03), "how do I add these email based events... I'd
// like to forward it to Bulbord automatically": a member forwards (or an
// event newsletter sends directly to) a dedicated inbound address, and
// whatever real, dated events are in it get extracted the same way
// resourcing.ts extracts events from a scraped webpage — same model
// (claude-opus-5, medium effort), same rule (never invent, empty array if
// nothing real and dated is found), same destination (`approved` directly,
// same as any other automated extraction since 2026-09-03 — see
// resourcing.ts's own note on why the earlier "always pending" rule was
// reversed).
//
// Bounds the LLM call's input size/cost — plenty for a real email body,
// even a long HTML newsletter once tags are stripped.
const MAX_EMAIL_TEXT_CHARS = 12_000

const SYSTEM_PROMPT = `You extract upcoming events from an email's body text, for a family/community events app in the Chicago area. The email may be a direct listing, a forwarded message, or a newsletter digest covering several events.

Rules:
- Only include events happening today or in the future, relative to the given "today" date — never past events.
- start_date must be YYYY-MM-DD. If the email gives a specific time, set start_time to 24-hour HH:MM and all_day to false; if there's genuinely no specific time (or the event runs all day), omit start_time and set all_day to true.
- description is optional: a short one-sentence description if the email gives useful detail, otherwise omit it.
- location_name is an optional human-friendly venue name (not a street address) when the email names one; address is an optional street address.
- If the email lists several distinct events (e.g. a newsletter digest), include each as its own entry.
- Ignore forwarding boilerplate, footers, unsubscribe links, and signature blocks — they're never real events.
- If you can't confidently identify any real, dated, upcoming events in this email, return an empty array — never invent one.

Respond with ONLY a JSON array, no markdown fences, no explanation. Each element:
{"title": string, "description"?: string, "start_date": string, "start_time"?: string, "all_day": boolean, "address"?: string, "location_name"?: string}`

interface ExtractedEvent {
  title?: unknown
  description?: unknown
  start_date?: unknown
  start_time?: unknown
  all_day?: unknown
  address?: unknown
  location_name?: unknown
}

function toCandidateEvent(raw: ExtractedEvent, sourceUrl: string): CandidateEvent | null {
  if (typeof raw.title !== 'string' || typeof raw.start_date !== 'string') return null
  if (raw.start_date < todayInChicago()) return null

  return {
    title: raw.title,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    startDate: raw.start_date,
    startTime: typeof raw.start_time === 'string' ? raw.start_time : undefined,
    allDay: raw.all_day === true,
    address: typeof raw.address === 'string' ? raw.address : undefined,
    locationName: typeof raw.location_name === 'string' ? raw.location_name : undefined,
    sourceUrl,
    status: 'approved',
  }
}

// Best-effort like resourcing.ts's own extractor: no ANTHROPIC_API_KEY, a
// refusal, or malformed model output all degrade to "found nothing" rather
// than throwing, so one bad email can't fail the whole webhook.
export async function extractCandidateEventsFromEmail(subject: string, bodyText: string, sourceUrl: string): Promise<CandidateEvent[]> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return []

  const trimmedBody = bodyText.trim().slice(0, MAX_EMAIL_TEXT_CHARS)
  if (!trimmedBody) return []

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify({ today: todayInChicago(), subject, body_text: trimmedBody }) }],
    })

    if (message.stop_reason === 'refusal') return []
    const block = message.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return []

    const parsed = JSON.parse(stripJsonCodeFence(raw))
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => toCandidateEvent(item as ExtractedEvent, sourceUrl))
      .filter((c): c is CandidateEvent => c !== null)
  } catch {
    return []
  }
}

// Plain-text body preferred (Resend already gives it to us); falls back to
// stripping the HTML body the same way resourcing.ts strips a scraped page,
// for the (uncommon) email that's HTML-only.
export function extractBodyText(text: string | null, html: string | null): string {
  if (text?.trim()) return text
  if (!html) return ''
  const $ = cheerio.load(html)
  $('script, style').remove()
  return $('body').text().replace(/\s+/g, ' ').trim()
}

// Every distinct sender gets its own real, persistent event_sources row
// (found or created here) rather than one shared "inbound email" bucket —
// same "a stable host is its own source, not a generic catch-all" rule this
// codebase already learned the hard way (see CLAUDE.md's Camps sourcing
// checklist item 9 / the French Market incident). `mailto:<address>` is the
// stable per-sender dedup key ingestEvents() uses (title + start_date +
// sourceUrl) — a real re-send of the same event from the same sender
// dedupes against itself; a genuinely different event doesn't.
async function findOrCreateEmailSource(fromAddress: string, fromName: string | null): Promise<{ id: string; url: string }> {
  const sourceUrl = `mailto:${fromAddress}`
  const [existing] = await db
    .select({ id: eventSources.id, url: eventSources.url })
    .from(eventSources)
    .where(and(eq(eventSources.url, sourceUrl), isNull(eventSources.deletedAt)))
    .limit(1)
  if (existing) return existing

  const [created] = await db
    .insert(eventSources)
    .values({
      name: fromName ? `${fromName} (email)` : fromAddress,
      url: sourceUrl,
      type: 'email',
      isActive: true,
      notes: `Auto-created from an inbound email forward. Real emails from this address are extracted for events automatically — see /admin/dev-tools or the source detail page to deactivate if this turns out to be unwanted.`,
    })
    .returning({ id: eventSources.id, url: eventSources.url })
  return created
}

export interface InboundEmailResult {
  fromAddress: string
  subject: string
  added: number
  skipped: number
}

// The actual work once a received email's full content is in hand (see
// email-ingest-routes.ts for how it gets here) — extract, dedupe/insert via
// the same ingestEvents() pipeline every other sourcing path uses, log it.
export async function processInboundEmail(params: {
  fromAddress: string
  fromName: string | null
  subject: string
  text: string | null
  html: string | null
}): Promise<InboundEmailResult> {
  const source = await findOrCreateEmailSource(params.fromAddress, params.fromName)
  const bodyText = extractBodyText(params.text, params.html)
  const candidates = await extractCandidateEventsFromEmail(params.subject, bodyText, source.url)
  const { inserted, skipped } = await ingestEvents(candidates, { sourceId: source.id, actor: 'system:inbound-email' })
  await db.update(eventSources).set({ lastCheckedAt: new Date() }).where(eq(eventSources.id, source.id))
  return { fromAddress: params.fromAddress, subject: params.subject, added: inserted, skipped }
}

// Fetches a received email's full content from Resend (the webhook payload
// itself only carries metadata — see email-ingest-routes.ts) and processes
// it. Split out so the admin test-send tool (and a future retry path) can
// call it directly by email_id without going through a real webhook.
export async function processReceivedEmailById(emailId: string): Promise<InboundEmailResult | null> {
  const { data, error } = await resendClient.emails.receiving.get(emailId)
  if (error || !data) return null

  return processInboundEmail({
    fromAddress: data.from,
    fromName: null, // Resend's `from` is a bare address here, no display name to split out
    subject: data.subject,
    text: data.text,
    html: data.html,
  })
}
