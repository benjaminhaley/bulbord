import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog, rejectedEventCandidates } from '../db/schema.js'
import { todayInChicago } from '../dates.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { checkDateQuality, checkTimeQuality, buildDuplicateCheck, runTextChecksWithRetry, type PipelineChecks } from './candidate-checks.js'
import { findLikelyDuplicateEvent } from './duplicate-detection.js'
import { enrichEventImages } from './image-enrichment.js'
import { lookupMoviePoster } from './movie-poster-lookup.js'
import { simplifyTitle } from './title-normalization.js'

// Matches the "Movie Night: <film>" convention used for Gallagher Way movie
// screenings (see seed-2026-07-31-new-sources.ts and
// update-2026-08-03-manual-sourcing-pass.ts) — if title simplification's own
// output convention changes later, this needs updating to match.
const MOVIE_NIGHT_TITLE_PATTERN = /^Movie Night: (.+)$/

export interface CandidateEvent {
  title: string
  description?: string
  startDate: string // YYYY-MM-DD
  startTime?: string // HH:MM, omit for all_day / no specific time
  allDay: boolean
  address?: string
  locationName?: string
  latitude?: string
  longitude?: string
  sourceUrl: string
  // A directly-verified image URL to use instead of extracting one from
  // sourceUrl — for sources extraction can't reach (e.g. a JS-rendered page)
  // where a real image was found and hand-checked another way.
  imageUrl?: string
  status: 'approved' | 'pending'
  // Set by candidate-validation.ts's filterFamilyRelevantCandidates() on
  // every candidate it keeps — carried through to the inserted event's own
  // pipelineRelevanceReason column (Pipeline Review, feedback #138) purely
  // for later admin review. Per-field quality checks (title/description/
  // location/address/date/time/image/duplicate) are computed fresh inside
  // ingestEvents() itself — see candidate-checks.ts — not carried on this
  // type, since they depend on the real row (image) and real dedup result.
  relevanceReason?: string
}

export interface IngestOptions {
  sourceId: string
  actor: string // e.g. 'claude:manual-sourcing', 'system:daily-job'
  // Candidates the caller's own second-pass relevance check
  // (candidate-validation.ts) already dropped BEFORE calling ingestEvents —
  // passed through so this function's one events_log write covers the whole
  // pipeline's reasoning for a run (see the 2026-09-04 debuggability note
  // below), and so a rejected_event_candidates row can be persisted for each
  // one (Pipeline Review, feedback #138) with enough data to reconstruct it
  // later if an admin decides the rejection was wrong.
  filteredOut?: { candidate: CandidateEvent; reason: string }[]
  // The raw, cleaned page/email text every candidate in this batch was
  // extracted from — threaded through so candidate-checks.ts's self-healing
  // retry can re-read the real source for a better address/title/description
  // instead of just re-guessing from the same already-extracted fields.
  // Omitted by a caller with no such text (e.g. "add anyway" rebuilding from
  // a stored candidateData snapshot) — the retry still runs, just without
  // this extra context (fail-open, same posture as every other check here).
  sourceText?: string
  // Pipeline Review v2 (2026-09-06): a human explicitly approving a
  // candidate (the review page's "Approve" action on a previously-rejected
  // one) should actually publish it, not have the automated checklist hold
  // it back again — checks still run and are still recorded for the record,
  // they just don't gate the outcome for this one call. Never set by the
  // normal resourcing.ts/email-ingest.ts path, where the checklist is the
  // whole point.
  forceApprove?: boolean
}

// Reusable by any trigger — a manual sourcing pass today, a future daily job,
// or a future per-source scraper. Upserts on (title, start_date, source_url).
export async function ingestEvents(candidates: CandidateEvent[], { sourceId, actor, filteredOut = [], sourceText, forceApprove = false }: IngestOptions) {
  let inserted = 0
  let skipped = 0
  const toFinalize: { id: string; candidate: CandidateEvent; title: string; sourceUrl: string; description?: string }[] = []
  // Debuggability, added 2026-09-04 directly in response to Ben asking
  // whether this pipeline records enough to figure out after the fact why a
  // bad event/image got through — before this, a skip only ever incremented
  // a counter, with the actual title and which of the two dedup checks
  // caught it gone the instant `continue` ran. Recorded here and logged
  // below in the same events_ingested row as everything else this run did.
  const duplicateSkips: {
    candidate: CandidateEvent
    title: string
    reason: 'exact_match' | 'likely_duplicate'
    duplicateOfEventId: string
  }[] = []

  for (const candidate of candidates) {
    // Simplified once and reused for both the dedup lookup and the insert
    // value, so a later re-ingestion of the same source page matches the
    // same (already-simplified) row instead of drifting into a duplicate.
    const title = await simplifyTitle({
      title: candidate.title,
      description: candidate.description,
      locationName: candidate.locationName,
    })

    const existing = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(eq(events.title, title), eq(events.startDate, candidate.startDate), eq(events.sourceUrl, candidate.sourceUrl)),
      )
      .limit(1)

    if (existing.length > 0) {
      skipped++
      duplicateSkips.push({ candidate, title, reason: 'exact_match', duplicateOfEventId: existing[0].id })
      continue
    }

    // Feedback #137: the exact-match check above only catches a source
    // re-scraping its own already-ingested page. A second, fuzzier check —
    // across every approved event on the same date regardless of which
    // source it came from — catches the real cross-source shape this
    // feedback flagged (a generic chamber-calendar scrape re-describing an
    // event a dedicated source already carries under a fuller name). See
    // duplicate-detection.ts's own header for why this is a substring check
    // on squashed titles, address-aware, rather than a word-overlap ratio.
    const sameDayEvents = await db
      .select({ id: events.id, title: events.title, address: events.address })
      .from(events)
      .where(and(eq(events.startDate, candidate.startDate), isNull(events.deletedAt)))
    const likelyDuplicate = findLikelyDuplicateEvent({ title, address: candidate.address }, sameDayEvents)
    if (likelyDuplicate) {
      skipped++
      duplicateSkips.push({ candidate, title, reason: 'likely_duplicate', duplicateOfEventId: likelyDuplicate.id })
      continue
    }

    // events.image_url/thumbnail_url are NOT NULL (see uploads/placeholder.ts)
    // — real image resolution happens after insert (enrichEventImages below,
    // a network fetch + quality gate), so a generated placeholder goes in at
    // insert time to satisfy the constraint immediately; enrichment then
    // UPDATEs it to a real photo if one passes, or leaves the placeholder in
    // place if nothing does.
    const placeholder = await uploadPlaceholderImage(title, 'events')

    // Pipeline Review v2 (2026-09-06): always inserted as 'pending' at this
    // point, regardless of candidate.status — the checklist below (run once
    // every candidate in this batch has a real row) decides the real final
    // status. A member never sees a 'pending' row (every member-facing query
    // filters status='approved'), so there's no visible flicker either way.
    const [row] = await db
      .insert(events)
      .values({
        title,
        description: candidate.description,
        startDate: candidate.startDate,
        startTime: candidate.startTime,
        allDay: candidate.allDay,
        address: candidate.address,
        locationName: candidate.locationName,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        sourceUrl: candidate.sourceUrl,
        sourceId,
        imageUrl: placeholder.imageUrl,
        thumbnailUrl: placeholder.thumbnailUrl,
        status: 'pending',
        pipelineRelevanceReason: candidate.relevanceReason,
      })
      .returning({ id: events.id })
    inserted++

    toFinalize.push({ id: row.id, candidate: { ...candidate, title }, title, sourceUrl: candidate.sourceUrl, description: candidate.description })
  }

  // Self-healing text checks (title/description/location label/address) —
  // one batch call plus, for anything that fails, one bounded retry against
  // the real source text (see candidate-checks.ts). Any corrected field
  // values the retry found are applied to the row before it's finalized.
  const textResults = await runTextChecksWithRetry(
    toFinalize.map((f) => ({ title: f.title, description: f.candidate.description, address: f.candidate.address, locationName: f.candidate.locationName })),
    sourceText,
  )

  // A movie-night candidate's own source_url is usually one shared listing
  // page (see movie-poster-lookup.ts) — prefer the film's real poster over
  // whatever generic image that page yields, unless a candidate already
  // supplies its own hand-verified imageUrl.
  const toEnrich = await Promise.all(
    toFinalize.map(async (f, i) => {
      const corrected = textResults[i].correctedFields
      const description = corrected.description ?? f.description
      const movieMatch = f.candidate.imageUrl ? null : f.title.match(MOVIE_NIGHT_TITLE_PATTERN)
      const imageUrl = f.candidate.imageUrl ?? (movieMatch ? await lookupMoviePoster(movieMatch[1]) : null)
      return { id: f.id, sourceUrl: f.sourceUrl, imageUrl, title: corrected.title ?? f.title, description }
    }),
  )
  const { sourced, none, traces, checksByEventId } = await enrichEventImages(toEnrich)

  const today = todayInChicago()
  await Promise.all(
    toFinalize.map(async (f, i) => {
      const { checks: textChecks, correctedFields } = textResults[i]
      const imageChecks = checksByEventId.get(f.id)
      const checks: PipelineChecks = {
        ...textChecks,
        dateQuality: checkDateQuality(f.candidate.startDate, today),
        timeQuality: checkTimeQuality(f.candidate.startTime, f.candidate.allDay),
        imageQuality: imageChecks?.imageQuality ?? { pass: false, reason: 'Image check did not run', attempts: 1 },
        imageRelevance: imageChecks?.imageRelevance ?? { pass: false, reason: 'Image check did not run', attempts: 1 },
        duplicateCheck: buildDuplicateCheck(),
      }
      const pipelineChecksPassed = Object.values(checks).every((c) => c.pass)

      await db
        .update(events)
        .set({
          ...correctedFields.title !== undefined ? { title: correctedFields.title } : {},
          ...correctedFields.description !== undefined ? { description: correctedFields.description } : {},
          ...correctedFields.address !== undefined ? { address: correctedFields.address } : {},
          ...correctedFields.locationName !== undefined ? { locationName: correctedFields.locationName } : {},
          status: forceApprove || pipelineChecksPassed ? 'approved' : 'pending',
          pipelineChecksPassed,
          pipelineQualityChecks: checks,
          updatedAt: new Date(),
        })
        .where(eq(events.id, f.id))
    }),
  )

  // Pipeline Review (feedback #138, 2026-09-06): persist every candidate
  // that didn't become an events row — before this, a rejected candidate's
  // full data (dates, address, everything needed to reconstruct it) was
  // discarded the moment this function moved on, leaving only the
  // {title, reason} pair below inside events_log. This is what makes an
  // admin's later "add anyway" action on a wrongly-rejected candidate
  // possible without re-running extraction.
  const rejectedRows = [
    ...filteredOut.map(({ candidate, reason }) => ({
      eventSourceId: sourceId,
      title: candidate.title,
      candidateData: candidate,
      rejectionType: 'relevance' as const,
      rejectionReason: reason,
    })),
    ...duplicateSkips.map(({ candidate, title, reason, duplicateOfEventId }) => ({
      eventSourceId: sourceId,
      title,
      candidateData: candidate,
      rejectionType: 'duplicate' as const,
      rejectionReason: reason === 'exact_match' ? 'Exact match of an already-ingested event' : 'Looks like an already-approved same-day event',
      duplicateOfEventId,
    })),
  ]
  if (rejectedRows.length > 0) {
    await db.insert(rejectedEventCandidates).values(rejectedRows)
  }

  await db.insert(eventsLog).values({
    actor,
    action: 'events_ingested',
    metadata: {
      candidateCount: candidates.length,
      inserted,
      skipped,
      sourceId,
      imagesSourced: sourced,
      imagesMissing: none,
      // Full per-candidate/per-image reasoning for this run — see
      // IngestOptions.filteredOut, duplicateSkips above, and
      // image-enrichment.ts's ImageCandidateTrace for what each covers and
      // why they exist. Only image traces with at least one rejected
      // candidate are worth a human's attention, but every trace is kept
      // (not just the "interesting" ones) so a future "why did THIS image
      // get picked over the alternatives" question about an
      // apparently-fine event can still be answered too. Kept as the
      // lightweight {title, reason} shape it's always been — the full
      // candidate data now lives in rejected_event_candidates instead.
      filteredOut: filteredOut.map(({ candidate, reason }) => ({ title: candidate.title, reason })),
      duplicateSkips: duplicateSkips.map(({ title, reason }) => ({ title, reason })),
      imageTraces: traces,
    },
  })

  return { inserted, skipped }
}
