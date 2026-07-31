import { and, eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { enrichEventImages } from './image-enrichment.js'

export interface CandidateEvent {
  title: string
  description?: string
  startDate: string // YYYY-MM-DD
  startTime?: string // HH:MM, omit for all_day / no specific time
  allDay: boolean
  address?: string
  latitude?: string
  longitude?: string
  sourceUrl: string
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
  const toEnrich: { id: string; sourceUrl: string }[] = []

  for (const candidate of candidates) {
    const existing = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.title, candidate.title),
          eq(events.startDate, candidate.startDate),
          eq(events.sourceUrl, candidate.sourceUrl),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    const [row] = await db
      .insert(events)
      .values({
        title: candidate.title,
        description: candidate.description,
        startDate: candidate.startDate,
        startTime: candidate.startTime,
        allDay: candidate.allDay,
        address: candidate.address,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        sourceUrl: candidate.sourceUrl,
        sourceId,
        status: candidate.status,
      })
      .returning({ id: events.id })
    inserted++
    toEnrich.push({ id: row.id, sourceUrl: candidate.sourceUrl })
  }

  const imagesEnriched = await enrichEventImages(toEnrich)

  await db.insert(eventsLog).values({
    actor,
    action: 'events_ingested',
    metadata: { candidateCount: candidates.length, inserted, skipped, sourceId, imagesEnriched },
  })

  return { inserted, skipped }
}
