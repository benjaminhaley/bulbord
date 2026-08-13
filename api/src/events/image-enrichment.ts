import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { extractPageImageCandidates } from '../uploads/extract-page-image.js'
import { fetchExternalImage } from '../uploads/fetch-external-image.js'
import { isLowQualityImage } from '../uploads/image-quality.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'

// Tries every candidate image in priority order — a manually-vetted
// overrideImageUrl first (a subject-specific lookup like
// movie-poster-lookup.ts, or a hand-verified URL for a source extraction
// can't reach; see CandidateEvent.imageUrl in ingest.ts), then whatever
// extractPageImageCandidates finds on the source page (og:image, JSON-LD,
// WordPress featured image, best plain <img>, site logo) — downloading and
// quality-checking each (see image-quality.ts) rather than trusting the
// first one found: a highest-priority tag can point at something unusably
// small (a site's own tiny header badge misconfigured as its og:image), and
// the next candidate down might be a real, usable photo. Leaves
// image_url/thumbnail_url null when nothing in the whole list passes — no
// generated placeholder (2026-07-31 feedback: a placeholder reads as broken,
// not as "no image yet") and no low-quality substitute either.
export async function enrichEventImage(
  eventId: string,
  { sourceUrl, overrideImageUrl }: { sourceUrl: string | null; overrideImageUrl?: string | null },
): Promise<'sourced' | 'none'> {
  const candidates = [
    ...(overrideImageUrl ? [{ url: overrideImageUrl, isLogo: false }] : []),
    ...(sourceUrl ? await extractPageImageCandidates(sourceUrl) : []),
  ]

  for (const candidate of candidates) {
    const downloaded = await fetchExternalImage(candidate.url)
    if (!downloaded) continue
    if (await isLowQualityImage(downloaded, { isLogo: candidate.isLogo })) continue

    const { key, thumbnailKey } = await uploadImage(downloaded, 'events')
    await db
      .update(events)
      .set({ imageUrl: imageUrl(key), thumbnailUrl: imageUrl(thumbnailKey), updatedAt: new Date() })
      .where(eq(events.id, eventId))

    return 'sourced'
  }

  return 'none'
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
