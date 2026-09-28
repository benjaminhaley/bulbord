import { createHash } from 'node:crypto'

import * as cheerio from 'cheerio'
import { and, desc, eq, gt, gte, isNull, ne, sql } from 'drizzle-orm'

import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import { db } from '../db/client.js'
import { todayInChicago } from '../dates.js'
import { eventSources, eventsLog } from '../db/schema.js'
import { fetchWithTimeout } from '../uploads/fetch-with-timeout.js'
import { renderPageHtml } from '../uploads/render-page.js'
import { filterFamilyRelevantCandidates } from './candidate-validation.js'
import { AUDIENCE_RELEVANCE_RULES } from './extraction-filters.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'
import { getRetryStrategiesPromptBlock } from './retry-strategies.js'
import { interpretReviewNote, occurrenceToCandidate } from './review-note-actions.js'

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
- If the page only has one umbrella listing for a series of distinct events (e.g. "month-long film series, screenings most nights", "fall class series") without the individual dates, still include it once, but set "series_umbrella": true — it gets split into its real occurrences by a follow-up search. Never set it on a single event, or when the page already lists each occurrence.
- If you can't confidently identify any real, dated, upcoming events on this page, return an empty array — never invent one.
${AUDIENCE_RELEVANCE_RULES}

Respond with ONLY a JSON array, no markdown fences, no explanation. Each element:
{"title": string, "description"?: string, "start_date": string, "start_time"?: string, "all_day": boolean, "address"?: string, "location_name"?: string, "series_umbrella"?: boolean}`

// Instructions handed to review-note-actions.ts's interpretReviewNote for an
// umbrella listing the extractor flagged — the same code path a reviewer's
// "split this into one event per film" note goes through (2026-09-28, the
// Music Box of Horrors listing that prompted it), so the pipeline does it on
// its own the first time rather than waiting for a reviewer to ask.
const AUTO_SPLIT_NOTE =
  'This listing is an umbrella for a series of distinct events. Split it into one event per individual occurrence (e.g. one per film or per session) with its real date and time. If the individual occurrences are not published anywhere you can find, answer "cannot".'
// Each split is a web-search call — bounded per source so one aggregator
// page full of series can't run up a large bill in one pass.
const MAX_AUTO_SPLITS_PER_SOURCE = 3

interface ExtractedEvent {
  title?: unknown
  description?: unknown
  start_date?: unknown
  start_time?: unknown
  all_day?: unknown
  address?: unknown
  location_name?: unknown
  series_umbrella?: unknown
}

// Replaces each flagged umbrella candidate with its real occurrences when
// they can be found; otherwise keeps the umbrella as-is (no worse than
// before). Never throws — interpretReviewNote fails to an explained "cannot".
async function splitUmbrellaCandidates(items: { candidate: CandidateEvent; umbrella: boolean }[], pageText: string): Promise<CandidateEvent[]> {
  let splitsLeft = MAX_AUTO_SPLITS_PER_SOURCE
  const out: CandidateEvent[] = []
  for (const { candidate, umbrella } of items) {
    if (!umbrella || splitsLeft <= 0) {
      out.push(candidate)
      continue
    }
    splitsLeft--
    const decision = await interpretReviewNote(
      {
        title: candidate.title,
        description: candidate.description ?? null,
        startDate: candidate.startDate,
        startTime: candidate.startTime ?? null,
        allDay: candidate.allDay,
        address: candidate.address ?? null,
        locationName: candidate.locationName ?? null,
        sourceUrl: candidate.sourceUrl,
      },
      AUTO_SPLIT_NOTE,
      pageText,
    )
    if (decision.action === 'split') {
      out.push(...decision.occurrences.map((o) => occurrenceToCandidate(o, { sourceUrl: candidate.sourceUrl, address: candidate.address ?? null, locationName: candidate.locationName ?? null })))
    } else {
      out.push(candidate)
    }
  }
  return out
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
  // Set only when fetching the source page itself failed (not for a missing
  // API key or a model error) — lets a recheck say "couldn't read the page".
  pageUnreadable?: true
  // Candidates the second-pass validator (candidate-validation.ts) already
  // dropped, with its own stated reason — carried on this result so the
  // caller can log them into ingestEvents()'s own events_ingested row
  // rather than them vanishing the moment filterFamilyRelevantCandidates
  // filters them out. See ingest.ts's IngestOptions.filteredOut.
  rejectedCandidates: { candidate: CandidateEvent; reason: string }[]
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
  // The cleaned page text this batch was extracted from, threaded through
  // to ingestEvents() as IngestOptions.sourceText — Pipeline Review v2's
  // self-healing retry re-reads this for a better address/title/description
  // instead of just re-guessing from the same already-extracted fields.
  // `null` on the same early-exit paths as contentHash.
  pageText: string | null
}

function hashPageText(pageText: string): string {
  return createHash('sha256').update(pageText).digest('hex')
}

// Fetches a page and reduces it to the same cleaned, bounded visible-text
// shape extractCandidateEventsFromSource extracts from it — pulled out so a
// caller who just needs fresh source text (not a fresh extraction pass), like
// Pipeline Review's own Retry action re-reading an already-ingested event's
// source_url for a better address, doesn't have to duplicate this fetch +
// cheerio-strip logic. Returns null on any failure (unreachable page,
// non-HTML response, empty body) — same best-effort posture as everything
// else in this file.
// Below this much visible text, a page is almost certainly a JavaScript
// shell (or an error page) rather than real content.
const MIN_STATIC_TEXT_CHARS = 500

function visibleText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, nav, footer, noscript').remove()
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_TEXT_CHARS)
}

// A page's visible text: a plain fetch first, falling back to a real headless
// browser (uploads/render-page.ts) when that fails or comes back nearly empty
// — or always, for a source flagged `render_js` whose events are loaded by
// JavaScript even though the static page has some text (e.g. Chicago Kids).
export async function fetchPageText(sourceUrl: string, options: { alwaysRender?: boolean } = {}): Promise<string | null> {
  let staticText: string | null = null
  const response = await fetchWithTimeout(sourceUrl, FETCH_TIMEOUT_MS)
  if (response?.ok && (response.headers.get('content-type') ?? '').includes('html')) {
    try {
      staticText = visibleText(await response.text()) || null
    } catch {
      staticText = null
    }
  }
  if (!options.alwaysRender && staticText && staticText.length >= MIN_STATIC_TEXT_CHARS) return staticText

  const renderedHtml = await renderPageHtml(sourceUrl)
  const renderedText = renderedHtml ? visibleText(renderedHtml) : ''
  return renderedText.length > (staticText?.length ?? 0) ? renderedText : staticText
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
  alwaysRender = false,
): Promise<ExtractionResult> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return { candidates: [], rejectedCandidates: [], contentHash: null, pageText: null }

  const pageText = await fetchPageText(sourceUrl, { alwaysRender })
  if (!pageText) return { candidates: [], rejectedCandidates: [], contentHash: null, pageText: null, pageUnreadable: true }

  try {
    const contentHash = hashPageText(pageText)
    // The real fix for the 2026-09-03 duplicate-events incident: this
    // model has no temperature/top_p knob, so re-running extraction over
    // page text we've already successfully processed is not safe — it
    // reliably produces near-duplicate titles for the same real events
    // rather than a clean skip. Not calling the LLM at all when nothing
    // has changed is the only robust guarantee.
    if (previousContentHash && contentHash === previousContentHash) {
      return { candidates: [], rejectedCandidates: [], contentHash, pageText }
    }

    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT + (await getRetryStrategiesPromptBlock('extraction')),
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ today: todayInChicago(), source_url: sourceUrl, source_notes: notes, page_text: pageText }),
        },
      ],
    })

    if (message.stop_reason === 'refusal') return { candidates: [], rejectedCandidates: [], contentHash: null, pageText }
    const block = message.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return { candidates: [], rejectedCandidates: [], contentHash: null, pageText }

    const parsed = JSON.parse(stripJsonCodeFence(raw))
    if (!Array.isArray(parsed)) return { candidates: [], rejectedCandidates: [], contentHash: null, pageText }

    const extracted = parsed
      .map((item) => {
        const candidate = toCandidateEvent(item as ExtractedEvent, sourceUrl)
        return candidate ? { candidate, umbrella: (item as ExtractedEvent).series_umbrella === true } : null
      })
      .filter((c): c is { candidate: CandidateEvent; umbrella: boolean } => c !== null)
    const rawCandidates = await splitUmbrellaCandidates(extracted, pageText)
    const { kept: candidates, rejected: rejectedCandidates } = await filterFamilyRelevantCandidates(rawCandidates)
    return { candidates, rejectedCandidates, contentHash, pageText }
  } catch {
    return { candidates: [], rejectedCandidates: [], contentHash: null, pageText: null }
  }
}

interface SourceResourceResult {
  sourceId: string
  name: string
  added: number
  skipped: number
  error?: string
  // Page text identical to the last successful check, so extraction was
  // skipped (see extractCandidateEventsFromSource) — reported so a manual
  // single-source recheck can say why nothing was added.
  unchanged?: boolean
  // The page couldn't be fetched/read at all.
  unreadable?: boolean
}

export interface ResourceReport {
  // Captured before any source is checked, not derived from when the
  // summary log row is written (that happens after every source finishes) —
  // this is what lets a caller (the test-send digest, sourcing-cron.ts's own
  // real weekly send) scope "this run's output" correctly. See
  // getLatestEventSourcingRun()'s own doc comment for why the log-row
  // timestamp alone can't be used for that.
  startedAt: Date
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

export interface ResourceSampleOptions {
  // Process only the first N active sources — feedback, 2026-09-06 ("run a
  // sub-portion... maybe just use one source"): a fast, representative
  // sample run for testing, rather than waiting on all ~23 active sources.
  maxSources?: number
  // Cap how many extracted candidates, across the whole run, actually get
  // ingested — feedback, 2026-09-06 ("or just do the first five"). Once the
  // budget is spent, remaining sources are skipped entirely (no extraction
  // call either), so a sampled run stays genuinely fast, not just
  // fast-to-insert.
  maxCandidates?: number
}

// One source's extract → ingest → mark-checked step, shared by the batch
// run below and the per-source "Recheck" button (feedback, 2026-09-27:
// "recheck one source a la carte") so both go through the exact same path.
// Never throws — an error is reported on the result, same as in a batch run.
async function resourceOneSource(
  source: typeof eventSources.$inferSelect,
  actor: string,
  // Shared across a batch run's concurrent workers and charged right after
  // extraction, before the slower ingest, so a sampled run can't overspend.
  budget: { remaining: number } = { remaining: Infinity },
): Promise<SourceResourceResult> {
  try {
    const { candidates, rejectedCandidates, contentHash, pageText, pageUnreadable } = await extractCandidateEventsFromSource(
      source.url,
      source.notes,
      source.lastContentHash,
      source.renderJs,
    )
    // contentHash is set only when extraction genuinely succeeded (page read
    // and parsed, or unchanged since the last success). Anything else — page
    // unreadable, model error/refusal, malformed output, no API key — is a
    // failed check: reported as an error, and last_checked_at is left alone
    // so the Sources page's Checked column only counts real successes
    // (Ben, 2026-09-27).
    if (contentHash === null) {
      return {
        sourceId: source.id,
        name: source.name,
        added: 0,
        skipped: 0,
        error: pageUnreadable ? "Couldn't read the source page" : 'Event extraction failed (model error or unreadable output)',
        ...(pageUnreadable ? { unreadable: true } : {}),
      }
    }
    const sampledCandidates = candidates.slice(0, budget.remaining)
    budget.remaining -= sampledCandidates.length
    const { inserted, skipped } = await ingestEvents(sampledCandidates, {
      sourceId: source.id,
      actor,
      filteredOut: rejectedCandidates,
      sourceText: pageText ?? undefined,
    })
    await db.update(eventSources).set({ lastCheckedAt: new Date(), lastContentHash: contentHash }).where(eq(eventSources.id, source.id))
    return {
      sourceId: source.id,
      name: source.name,
      added: inserted,
      skipped,
      ...(contentHash === source.lastContentHash ? { unchanged: true } : {}),
    }
  } catch (err) {
    return { sourceId: source.id, name: source.name, added: 0, skipped: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// Rechecks one source on demand (active or not). Doesn't write an
// `event_sourcing_run` row — that's the whole-run summary Dev Tools and the
// weekly digest read as "the latest run"; ingestEvents() still logs its own
// per-source `events_ingested` entry, plus one `event_source_rechecked` here.
export async function resourceEventSource(
  sourceId: string,
  actor: string,
): Promise<(SourceResourceResult & { startedAt: Date }) | null> {
  const [source] = await db
    .select()
    .from(eventSources)
    .where(and(eq(eventSources.id, sourceId), isNull(eventSources.deletedAt)))
    .limit(1)
  if (!source) return null
  const startedAt = new Date()
  const result: SourceResourceResult =
    source.type === 'email'
      ? { sourceId: source.id, name: source.name, added: 0, skipped: 0, error: 'Email sources are fed by inbound email and can’t be rechecked' }
      : await resourceOneSource(source, actor)
  // startedAt feeds getPipelineReviewWindowStart() below.
  await db.insert(eventsLog).values({ actor, action: 'event_source_rechecked', metadata: { ...result, startedAt: startedAt.toISOString() } })
  return { ...result, startedAt }
}

// Re-runs the ingestion pipeline against every known active source (feedback
// #41) — deliberately re-scrapes sources already in event_sources rather
// than also discovering brand-new ones, which stays a separate, occasional
// manual ask (as feedback #12/#22/#24 were) rather than something an admin
// button can trigger repeatedly in production.
export async function resourceActiveEventSources(actor: string, sample: ResourceSampleOptions = {}): Promise<ResourceReport> {
  const startedAt = new Date()
  const allSources = await db
    .select()
    .from(eventSources)
    // Email sources are fed by inbound mail (email-ingest.ts); there's no
    // page to scrape, so checking them would only ever "fail".
    .where(and(eq(eventSources.isActive, true), isNull(eventSources.deletedAt), ne(eventSources.type, 'email')))
  const sources = sample.maxSources ? allSources.slice(0, sample.maxSources) : allSources

  const results: SourceResourceResult[] = new Array(sources.length)
  let index = 0
  const budget = { remaining: sample.maxCandidates ?? Infinity }

  async function worker() {
    while (index < sources.length) {
      const i = index++
      const source = sources[i]
      if (budget.remaining <= 0) {
        results[i] = { sourceId: source.id, name: source.name, added: 0, skipped: 0 }
        continue
      }
      results[i] = await resourceOneSource(source, actor, budget)
    }
  }

  await Promise.all(Array.from({ length: Math.min(RESOURCE_CONCURRENCY, sources.length) }, worker))

  const report: ResourceReport = {
    startedAt,
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
    metadata: {
      ...report,
      startedAt: startedAt.toISOString(),
      lastCheckedAt: report.lastCheckedAt ? new Date(report.lastCheckedAt).toISOString() : null,
    },
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
  const metadata = row.metadata as Omit<ResourceReport, 'startedAt' | 'lastCheckedAt'> & { startedAt?: string; lastCheckedAt: string | null }
  return {
    actor: row.actor,
    ranAt: row.createdAt,
    report: {
      ...metadata,
      // A row written before this field existed has no startedAt at all —
      // row.createdAt (when the summary was logged, just after the run
      // finished) is a close-enough fallback rather than an Invalid Date.
      startedAt: metadata.startedAt ? new Date(metadata.startedAt) : row.createdAt,
      lastCheckedAt: metadata.lastCheckedAt ? new Date(metadata.lastCheckedAt) : null,
    },
  }
}

// A recheck log written before startedAt was recorded: the log row lands
// just after the recheck finishes, and one source takes well under this.
const LEGACY_RECHECK_LOOKBACK_MS = 15 * 60 * 1000

// Where Pipeline Review's default view (and the weekly digest) starts: the
// latest full run's start, pulled earlier to cover any single-source
// recheck done since the run before it. Without this, a recheck's
// unreviewed output would silently drop out of the default view the moment
// the next weekly run happened. Null when no full run has ever happened.
export async function getPipelineReviewWindowStart(): Promise<Date | null> {
  const runs = await db
    .select({ createdAt: eventsLog.createdAt, metadata: eventsLog.metadata })
    .from(eventsLog)
    .where(eq(eventsLog.action, 'event_sourcing_run'))
    .orderBy(desc(eventsLog.createdAt))
    .limit(2)
  const latest = runs[0]
  if (!latest) return null
  const latestStartedAt = startedAtOf(latest)
  const previousRunEndedAt = runs[1]?.createdAt ?? null

  const rechecks = await db
    .select({ createdAt: eventsLog.createdAt, metadata: eventsLog.metadata })
    .from(eventsLog)
    .where(
      and(
        eq(eventsLog.action, 'event_source_rechecked'),
        // gt(), not a raw sql`` fragment: postgres.js can't bind a raw Date
        // param (a real 500 on Pipeline Review, 2026-09-27).
        previousRunEndedAt ? gt(eventsLog.createdAt, previousRunEndedAt) : undefined,
      ),
    )
  return reviewWindowStart(
    latestStartedAt,
    rechecks.map((r) => {
      const started = (r.metadata as { startedAt?: string }).startedAt
      return started ? new Date(started) : new Date(new Date(r.createdAt).getTime() - LEGACY_RECHECK_LOOKBACK_MS)
    }),
  )
}

function startedAtOf(row: { createdAt: Date; metadata: unknown }): Date {
  const started = (row.metadata as { startedAt?: string }).startedAt
  return started ? new Date(started) : row.createdAt
}

// Pure core of the above, for unit tests.
export function reviewWindowStart(latestRunStartedAt: Date, recheckStartedAts: Date[]): Date {
  return recheckStartedAts.reduce((min, d) => (d < min ? d : min), latestRunStartedAt)
}

export interface SourceFailure {
  sourceId: string
  name: string
  error: string
  at: Date
  via: 'run' | 'recheck'
  // A later successful check of the same source (last_checked_at only moves
  // on success) means this failure has since been fixed.
  resolved: boolean
}

// Every source whose check failed since `since` — from full sourcing runs'
// per-source results and from single-source rechecks — for Pipeline Review
// (Ben, 2026-09-27: "be sure the pipeline review notes any sources which had
// run failures"). Newest first; optionally narrowed to one source.
export async function getSourceFailuresSince(since: Date, sourceId?: string): Promise<SourceFailure[]> {
  const rows = await db
    .select({ action: eventsLog.action, createdAt: eventsLog.createdAt, metadata: eventsLog.metadata })
    .from(eventsLog)
    .where(and(sql`${eventsLog.action} in ('event_sourcing_run', 'event_source_rechecked')`, gte(eventsLog.createdAt, since)))
    .orderBy(desc(eventsLog.createdAt))

  const failures: Omit<SourceFailure, 'resolved'>[] = []
  for (const row of rows) {
    const results: SourceResourceResult[] =
      row.action === 'event_sourcing_run'
        ? ((row.metadata as { results?: SourceResourceResult[] }).results ?? [])
        : [row.metadata as SourceResourceResult]
    for (const r of results) {
      if (!r.error || (sourceId && r.sourceId !== sourceId)) continue
      failures.push({
        sourceId: r.sourceId,
        name: r.name,
        error: r.error,
        at: new Date(row.createdAt),
        via: row.action === 'event_sourcing_run' ? 'run' : 'recheck',
      })
    }
  }
  if (failures.length === 0) return []

  const checked = await db.select({ id: eventSources.id, lastCheckedAt: eventSources.lastCheckedAt }).from(eventSources)
  const lastChecked = new Map(checked.map((c) => [c.id, c.lastCheckedAt]))
  return failures.map((f) => {
    const last = lastChecked.get(f.sourceId)
    return { ...f, resolved: !!last && new Date(last) > f.at }
  })
}
