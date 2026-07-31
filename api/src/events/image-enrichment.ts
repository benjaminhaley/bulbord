import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { extractOgImageUrl } from '../uploads/extract-og-image.js'
import { fetchExternalImage } from '../uploads/fetch-external-image.js'
import { generatePlaceholderImage } from '../uploads/placeholder.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'

// Tries the source page's og:image (or twitter:image) first; falls back to a
// generated placeholder whenever that fails — no source_url, an unreachable
// page, no image meta tag, or a download failure — so every event ends up
// with an image_url, never null.
export async function enrichEventImage(
  eventId: string,
  sourceUrl: string | null,
  title: string,
): Promise<'sourced' | 'placeholder'> {
  const ogImageUrl = sourceUrl ? await extractOgImageUrl(sourceUrl) : null
  const downloaded = ogImageUrl ? await fetchExternalImage(ogImageUrl) : null
  const buffer = downloaded ?? (await generatePlaceholderImage(title))

  const { key, thumbnailKey } = await uploadImage(buffer, 'events')
  await db
    .update(events)
    .set({ imageUrl: imageUrl(key), thumbnailUrl: imageUrl(thumbnailKey), updatedAt: new Date() })
    .where(eq(events.id, eventId))

  return downloaded ? 'sourced' : 'placeholder'
}

const ENRICH_CONCURRENCY = 5

// Runs enrichEventImage across a batch of events with bounded concurrency —
// each one is a network fetch + image processing, so running them serially
// would make ingesting/backfilling N events take N times as long.
export async function enrichEventImages(
  rows: { id: string; sourceUrl: string | null; title: string }[],
): Promise<{ sourced: number; placeholder: number }> {
  let sourced = 0
  let placeholder = 0
  let index = 0

  async function worker() {
    while (index < rows.length) {
      const row = rows[index++]
      try {
        const result = await enrichEventImage(row.id, row.sourceUrl, row.title)
        if (result === 'sourced') sourced++
        else placeholder++
      } catch {
        // Even the placeholder path can fail (S3/network hiccup) — leave
        // image_url null; the next ingest/backfill pass will retry it.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(ENRICH_CONCURRENCY, rows.length) }, worker))
  return { sourced, placeholder }
}
