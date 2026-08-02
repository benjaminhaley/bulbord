import { and, eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { enrichEventImages } from './image-enrichment.js'
import { simplifyTitle } from './title-normalization.js'

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
  const toEnrich: { id: string; sourceUrl: string; imageUrl?: string }[] = []

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
        status: candidate.status,
      })
      .returning({ id: events.id })
    inserted++
    toEnrich.push({ id: row.id, sourceUrl: candidate.sourceUrl, imageUrl: candidate.imageUrl })
  }

  const { sourced, none } = await enrichEventImages(toEnrich)

  await db.insert(eventsLog).values({
    actor,
    action: 'events_ingested',
    metadata: { candidateCount: candidates.length, inserted, skipped, sourceId, imagesSourced: sourced, imagesMissing: none },
  })

  return { inserted, skipped }
}
