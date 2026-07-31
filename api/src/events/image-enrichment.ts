import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { extractPageImageUrl } from '../uploads/extract-page-image.js'
import { fetchExternalImage } from '../uploads/fetch-external-image.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'

// Tries to pull a real image off the source page (og:image, JSON-LD,
// WordPress featured image, or the best plain <img> — see extractPageImageUrl),
// or downloads a manually-vetted imageUrl when a candidate supplies one
// directly (for sources like a JS-rendered page that extraction can't reach —
// see CandidateEvent.imageUrl in ingest.ts). Leaves image_url/thumbnail_url
// null when neither finds a real photo — no generated placeholder (2026-07-31
// feedback: a placeholder reads as broken, not as "no image yet").
export async function enrichEventImage(
  eventId: string,
  { sourceUrl, overrideImageUrl }: { sourceUrl: string | null; overrideImageUrl?: string | null },
): Promise<'sourced' | 'none'> {
  const pageImageUrl = overrideImageUrl ?? (sourceUrl ? await extractPageImageUrl(sourceUrl) : null)
  const downloaded = pageImageUrl ? await fetchExternalImage(pageImageUrl) : null
  if (!downloaded) return 'none'

  const { key, thumbnailKey } = await uploadImage(downloaded, 'events')
  await db
    .update(events)
    .set({ imageUrl: imageUrl(key), thumbnailUrl: imageUrl(thumbnailKey), updatedAt: new Date() })
    .where(eq(events.id, eventId))

  return 'sourced'
}

const ENRICH_CONCURRENCY = 5

// Runs enrichEventImage across a batch of events with bounded concurrency —
// each one is a network fetch + image processing, so running them serially
// would make ingesting/backfilling N events take N times as long.
export async function enrichEventImages(
  rows: { id: string; sourceUrl: string | null; imageUrl?: string | null }[],
): Promise<{ sourced: number; none: number }> {
  let sourced = 0
  let none = 0
  let index = 0

  async function worker() {
    while (index < rows.length) {
      const row = rows[index++]
      try {
        const result = await enrichEventImage(row.id, { sourceUrl: row.sourceUrl, overrideImageUrl: row.imageUrl })
        if (result === 'sourced') sourced++
        else none++
      } catch {
        // Leave image_url null; the next ingest/backfill pass will retry it.
        none++
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(ENRICH_CONCURRENCY, rows.length) }, worker))
  return { sourced, none }
}
