import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { extractOgImageUrl } from '../uploads/extract-og-image.js'
import { fetchExternalImage } from '../uploads/fetch-external-image.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'

// Best-effort: og:image extraction, download, and upload can each fail in
// ordinary ways (page unreachable, no meta tag, image too large) — failures
// return false rather than throwing, so a bad source page never blocks
// ingestion of the rest of a batch.
export async function enrichEventImage(eventId: string, sourceUrl: string): Promise<boolean> {
  const ogImageUrl = await extractOgImageUrl(sourceUrl)
  if (!ogImageUrl) return false

  const buffer = await fetchExternalImage(ogImageUrl)
  if (!buffer) return false

  const { key, thumbnailKey } = await uploadImage(buffer, 'events')
  await db
    .update(events)
    .set({ imageUrl: imageUrl(key), thumbnailUrl: imageUrl(thumbnailKey), updatedAt: new Date() })
    .where(eq(events.id, eventId))

  return true
}

const ENRICH_CONCURRENCY = 5

// Runs enrichEventImage across a batch of events with bounded concurrency —
// each one is a network fetch + image processing, so running them serially
// would make ingesting/backfilling N events take N times as long.
export async function enrichEventImages(rows: { id: string; sourceUrl: string }[]): Promise<number> {
  let enriched = 0
  let index = 0

  async function worker() {
    while (index < rows.length) {
      const row = rows[index++]
      try {
        if (await enrichEventImage(row.id, row.sourceUrl)) enriched++
      } catch {
        // Best-effort — a single failure never blocks the rest of the batch.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(ENRICH_CONCURRENCY, rows.length) }, worker))
  return enriched
}
