import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
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
}

export interface IngestOptions {
  sourceId: string
  actor: string // e.g. 'claude:manual-sourcing', 'system:daily-job'
}

// Reusable by any trigger — a manual sourcing pass today, a future daily job,
// or a future per-source scraper. Upserts on (title, start_date, source_url).
export async function ingestEvents(candidates: CandidateEvent[], { sourceId, actor }: IngestOptions) {
  let inserted = 0
  let skipped = 0
  const toEnrich: { id: string; sourceUrl: string; imageUrl?: string | null; title: string; description?: string }[] = []

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
      continue
    }

    // events.image_url/thumbnail_url are NOT NULL (see uploads/placeholder.ts)
    // — real image resolution happens after insert (enrichEventImages below,
    // a network fetch + quality gate), so a generated placeholder goes in at
    // insert time to satisfy the constraint immediately; enrichment then
    // UPDATEs it to a real photo if one passes, or leaves the placeholder in
    // place if nothing does.
    const placeholder = await uploadPlaceholderImage(title, 'events')

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
        status: candidate.status,
      })
      .returning({ id: events.id })
    inserted++

    // A movie-night candidate's own source_url is usually one shared listing
    // page (see movie-poster-lookup.ts) — prefer the film's real poster over
    // whatever generic image that page yields, unless a candidate already
    // supplies its own hand-verified imageUrl.
    const movieMatch = candidate.imageUrl ? null : title.match(MOVIE_NIGHT_TITLE_PATTERN)
    const imageUrl = candidate.imageUrl ?? (movieMatch ? await lookupMoviePoster(movieMatch[1]) : null)

    toEnrich.push({ id: row.id, sourceUrl: candidate.sourceUrl, imageUrl, title, description: candidate.description })
  }

  const { sourced, none } = await enrichEventImages(toEnrich)

  await db.insert(eventsLog).values({
    actor,
    action: 'events_ingested',
    metadata: { candidateCount: candidates.length, inserted, skipped, sourceId, imagesSourced: sourced, imagesMissing: none },
  })

  return { inserted, skipped }
}
