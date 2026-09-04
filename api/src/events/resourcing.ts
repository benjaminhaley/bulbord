import { createHash } from 'node:crypto'

import * as cheerio from 'cheerio'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import { db } from '../db/client.js'
import { todayInChicago } from '../dates.js'
import { eventSources, eventsLog } from '../db/schema.js'
import { fetchWithTimeout } from '../uploads/fetch-with-timeout.js'
import { filterFamilyRelevantCandidates } from './candidate-validation.js'
import { AUDIENCE_RELEVANCE_RULES } from './extraction-filters.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

const FETCH_TIMEOUT_MS = 10_000
// Bounds the LLM call's input size/cost — plenty for a listings page's own
// text, and avoids paying to send a whole bloated page (nav chrome, footers,
// scripts already stripped below) through the model.
const MAX_PAGE_TEXT_CHARS = 15_000
const RESOURCE_CONCURRENCY = 3

const SYSTEM_PROMPT = `You extract upcoming events from a scraped webpage's visible text, for a family/community events app in the Chicago area.

Rules:
- Only include events happening today or in the future, relative to the given "today" date — never past events.
- If "source_notes" says to scope down to something specific (e.g. "only the kids' movie series"), only include events matching that scope — ignore everything else on the page.
- start_date must be YYYY-MM-DD. If the page gives a specific time, set start_time to 24-hour HH:MM and all_day to false; if there's genuinely no specific time (or the event runs all day), omit start_time and set all_day to true.
- description is optional: a short one-sentence description if the page gives useful detail, otherwise omit it.
- location_name is an optional human-friendly venue name (not a street address) when the page names one; address is an optional street address.
- If a recurring series lists multiple future occurrences, include each occurrence as its own entry with its own date.
- If you can't confidently identify any real, dated, upcoming events on this page, return an empty array — never invent one.
${AUDIENCE_RELEVANCE_RULES}

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
    // Auto-approved directly (2026-09-03, reversing the original "always
    // pending, never auto-approved" rule) — Ben: "the process shouldn't go
    // through pending... really, just add them." There was never a review
    // UI built for this queue anyway, so pending sourced events had no real
    // path to becoming visible other than a one-off manual status flip.
    status: 'approved',
  }
}

export interface ExtractionResult {
  candidates: CandidateEvent[]
  // Candidates the second-pass validator (candidate-validation.ts) already
  // dropped, with its own stated reason — carried on this result so the
  // caller can log them into ingestEvents()'s own events_ingested row
  // rather than them vanishing the moment filterFamilyRelevantCandidates
  // filters them out. See ingest.ts's IngestOptions.filteredOut.
  rejectedCandidates: { title: string; reason: string }[]
  // The hash of the page text this result is based on, to persist on
  // event_sources so the *next* check can skip re-extracting unchanged
  // content — see the schema.ts doc comment on lastContentHash for why
  // this exists (no sampling-control parameter is available on this model
  // to make repeat extraction deterministic instead). `null` means this
  // call didn't reach a trustworthy outcome (fetch/parse failure, no API
  // key) — the caller should leave the source's stored hash untouched so
  // the next run retries properly rather than wrongly "remembering" a
  // failed attempt as if it were a real check of that content.
  contentHash: string | null
}

function hashPageText(pageText: string): string {
  return createHash('sha256').update(pageText).digest('hex')
}

// Fetches a known source's page and asks Claude to pull out any real,
// upcoming, dated events from its visible text. Best-effort like
// image-enrichment.ts/title-normalization.ts: any failure (unreachable page,
// no API key, malformed model output) degrades to "found nothing" rather
// than throwing, so one broken source can't fail the whole admin-triggered
// re-sourcing run.
export async function extractCandidateEventsFromSource(
  sourceUrl: string,
  notes: string | null,
  previousContentHash: string | null = null,
): Promise<ExtractionResult> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return { candidates: [], rejectedCandidates: [], contentHash: null }

  const response = await fetchWithTimeout(sourceUrl, FETCH_TIMEOUT_MS)
  if (!response || !response.ok) return { candidates: [], rejectedCandidates: [], contentHash: null }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('html')) return { candidates: [], rejectedCandidates: [], contentHash: null }

  try {
    const html = await response.text()
    const $ = cheerio.load(html)
    $('script, style, nav, footer, noscript').remove()
    const pageText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_TEXT_CHARS)
    if (!pageText) return { candidates: [], rejectedCandidates: [], contentHash: null }

    const contentHash = hashPageText(pageText)
    // The real fix for the 2026-09-03 duplicate-events incident: this
    // model has no temperature/top_p knob, so re-running extraction over
    // page text we've already successfully processed is not safe — it
    // reliably produces near-duplicate titles for the same real events
    // rather than a clean skip. Not calling the LLM at all when nothing
    // has changed is the only robust guarantee.
    if (previousContentHash && contentHash === previousContentHash) {
      return { candidates: [], rejectedCandidates: [], contentHash }
    }

    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ today: todayInChicago(), source_url: sourceUrl, source_notes: notes, page_text: pageText }),
        },
      ],
    })

    if (message.stop_reason === 'refusal') return { candidates: [], rejectedCandidates: [], contentHash: null }
    const block = message.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return { candidates: [], rejectedCandidates: [], contentHash: null }

    const parsed = JSON.parse(stripJsonCodeFence(raw))
    if (!Array.isArray(parsed)) return { candidates: [], rejectedCandidates: [], contentHash: null }

    const rawCandidates = parsed
      .map((item) => toCandidateEvent(item as ExtractedEvent, sourceUrl))
      .filter((c): c is CandidateEvent => c !== null)
    const { kept: candidates, rejected: rejectedCandidates } = await filterFamilyRelevantCandidates(rawCandidates)
    return { candidates, rejectedCandidates, contentHash }
  } catch {
    return { candidates: [], rejectedCandidates: [], contentHash: null }
  }
}

interface SourceResourceResult {
  sourceId: string
  name: string
  added: number
  skipped: number
  error?: string
}

export interface ResourceReport {
  sourcesChecked: number
  totalAdded: number
  totalSkipped: number
  lastCheckedAt: Date | null
  results: SourceResourceResult[]
}

// The most recent time any active source was checked — shown in Developer
// Tools (feedback #41 follow-up) so an admin can tell whether "0 added" just
// happened or the tool hasn't actually run recently.
export async function getSourcesLastCheckedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastCheckedAt: sql<Date | null>`max(${eventSources.lastCheckedAt})` })
    .from(eventSources)
    .where(and(eq(eventSources.isActive, true), isNull(eventSources.deletedAt)))
  return row?.lastCheckedAt ?? null
}

// Re-runs the ingestion pipeline against every known active source (feedback
// #41) — deliberately re-scrapes sources already in event_sources rather
// than also discovering brand-new ones, which stays a separate, occasional
// manual ask (as feedback #12/#22/#24 were) rather than something an admin
// button can trigger repeatedly in production.
export async function resourceActiveEventSources(actor: string): Promise<ResourceReport> {
  const sources = await db
    .select()
    .from(eventSources)
    .where(and(eq(eventSources.isActive, true), isNull(eventSources.deletedAt)))

  const results: SourceResourceResult[] = new Array(sources.length)
  let index = 0

  async function worker() {
    while (index < sources.length) {
      const i = index++
      const source = sources[i]
      try {
        const { candidates, rejectedCandidates, contentHash } = await extractCandidateEventsFromSource(
          source.url,
          source.notes,
          source.lastContentHash,
        )
        const { inserted, skipped } = await ingestEvents(candidates, { sourceId: source.id, actor, filteredOut: rejectedCandidates })
        await db
          .update(eventSources)
          .set({ lastCheckedAt: new Date(), ...(contentHash ? { lastContentHash: contentHash } : {}) })
          .where(eq(eventSources.id, source.id))
        results[i] = { sourceId: source.id, name: source.name, added: inserted, skipped }
      } catch (err) {
        results[i] = {
          sourceId: source.id,
          name: source.name,
          added: 0,
          skipped: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(RESOURCE_CONCURRENCY, sources.length) }, worker))

  const report: ResourceReport = {
    sourcesChecked: sources.length,
    totalAdded: results.reduce((sum, r) => sum + r.added, 0),
    totalSkipped: results.reduce((sum, r) => sum + r.skipped, 0),
    lastCheckedAt: await getSourcesLastCheckedAt(),
    results,
  }

  // One row summarizing the whole run (all sources at once), distinct from
  // ingestEvents()'s own per-source `events_ingested` entries — same
  // "one entry per run" shape as newsletter_sent/camp_reminder_sent
  // (CLAUDE.md's Newsletter/Camp reminder email sections), and what
  // feedback #131's "keep some summary in admin of what has changed" reads
  // from (see Dev Tools' "Auto-updating events" section). Written for both
  // an admin-triggered manual run and the weekly cron run alike, since both
  // callers go through this one function.
  //
  // report.lastCheckedAt is typed Date | null but getSourcesLastCheckedAt()
  // hands back whatever the postgres driver returns for a raw sql
  // max(timestamp) aggregate, which is a string at runtime despite the
  // query's own sql<Date | null> annotation only asserting the TS type —
  // the same gotcha admin/staleness.ts's own doc comment already documents
  // (found there by testing against a live request, same lesson repeated
  // here since this new call site didn't inherit that normalization).
  // `new Date(...)` accepts either shape, so this doesn't need its own
  // instanceof branch.
  await db.insert(eventsLog).values({
    actor,
    action: 'event_sourcing_run',
    metadata: { ...report, lastCheckedAt: report.lastCheckedAt ? new Date(report.lastCheckedAt).toISOString() : null },
  })

  return report
}

export interface EventSourcingRunSummary {
  actor: string
  ranAt: Date
  report: ResourceReport
}

// Backs Dev Tools' "last run" summary (feedback #131) — read on page load,
// not just held in local state after a manual click, so a weekly cron run
// that happened while nobody was looking is still visible the next time an
// admin checks.
export async function getLatestEventSourcingRun(): Promise<EventSourcingRunSummary | null> {
  const [row] = await db
    .select({ actor: eventsLog.actor, createdAt: eventsLog.createdAt, metadata: eventsLog.metadata })
    .from(eventsLog)
    .where(eq(eventsLog.action, 'event_sourcing_run'))
    .orderBy(desc(eventsLog.createdAt))
    .limit(1)

  if (!row) return null
  const metadata = row.metadata as ResourceReport & { lastCheckedAt: string | null }
  return {
    actor: row.actor,
    ranAt: row.createdAt,
    report: { ...metadata, lastCheckedAt: metadata.lastCheckedAt ? new Date(metadata.lastCheckedAt) : null },
  }
}
