import { and, eq, isNull, ne } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { extractPageImageCandidates } from '../uploads/extract-page-image.js'
import { fetchExternalImage } from '../uploads/fetch-external-image.js'
import { isLowQualityImage } from '../uploads/image-quality.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'
import { searchWebImage } from '../uploads/web-image-search.js'

// A real, found incident (feedback #146/#150/#153, 2026-09-04): 8 different,
// unrelated events sourced from the same generic "upcoming events" listing
// page (northalsted.com/upcoming/) all ended up with the exact same og:image
// — byte-identical, confirmed by hash — because extractPageImageCandidates()
// fetches that one shared page regardless of which specific event is asking,
// so every event gets the *page's* own generic hero image, not anything
// specific to it. In this case that image was also inappropriate for a
// family app. A page-extracted content-image candidate (og:image, JSON-LD,
// best plain <img>) can only ever represent one specific thing; if this
// event's own source_url is already shared by another, differently-titled
// event, that candidate is definitionally not this event's own photo, no
// matter how well it scores on the existing size/aspect-ratio quality gate.
//
// Scoped to a *different* title deliberately: a genuine recurring series
// (the same real market/venue re-scraped weekly) shares one source_url
// across many same-titled occurrences on purpose, and each of those is
// still allowed to re-extract that page's own real photo — only a
// different-titled event sharing the URL is the shape of the actual bug.
async function isSharedListingPage(sourceUrl: string, eventId: string, title: string): Promise<boolean> {
  const [other] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.sourceUrl, sourceUrl), ne(events.id, eventId), ne(events.title, title), isNull(events.deletedAt)))
    .limit(1)
  return other !== undefined
}

// A second, complementary incident found while auditing the fix above
// (2026-09-04): several *different* BiblioCommons event pages — each with
// its own distinct source_url — all resolved to the exact same site logo
// image, since neither page had a real photo of its own and BibiloCommons'
// own site-wide fallback is identical everywhere. isSharedListingPage can't
// catch this (the pages genuinely differ), but the *resolved* image is
// still definitionally not specific to this event if another,
// differently-titled event already claimed that exact external URL.
// Checked against sourceImageUrl (the external URL a past enrichment
// actually used, recorded below) rather than imageUrl (our own re-hosted
// copy, which gets a fresh random key every upload even for identical
// bytes) — a cheap string comparison, no need to re-download and hash
// every other event's already-uploaded image.
async function isAlreadyClaimedImage(url: string, eventId: string, title: string): Promise<boolean> {
  const [other] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(eq(events.sourceImageUrl, url), ne(events.id, eventId), ne(events.title, title), isNull(events.deletedAt)),
    )
    .limit(1)
  return other !== undefined
}

// Tries every candidate image in priority order — a manually-vetted
// overrideImageUrl first (a subject-specific lookup like
// movie-poster-lookup.ts, or a hand-verified URL for a source extraction
// can't reach; see CandidateEvent.imageUrl in ingest.ts), then — unless
// source_url turns out to be a shared listing page another differently-
// titled event already points at (see isSharedListingPage above) — whatever
// extractPageImageCandidates finds on the source page (og:image, JSON-LD,
// WordPress featured image, best plain <img>, site logo), then — feedback
// #139, "the pipeline should assess image quality... find a better one"
// rather than settling for a flat placeholder the moment page-extraction
// comes up empty — a generic web image search keyed off the event's own
// title/description (see web-image-search.ts). Every candidate is downloaded
// and quality-checked (see image-quality.ts), and cross-checked against
// isAlreadyClaimedImage (see above), rather than trusted on sight: a
// highest-priority tag can point at something unusably small (a site's own
// tiny header badge misconfigured as its og:image) or, even at a passing
// size, at the same generic fallback another event already has. Returns
// 'none' when nothing in the whole list passes; the caller (ingest.ts) has
// already inserted a generated solid-color placeholder to satisfy
// events.imageUrl's NOT NULL constraint, so 'none' just means that
// placeholder stays rather than being replaced by a real photo.
export async function enrichEventImage(
  eventId: string,
  {
    sourceUrl,
    overrideImageUrl,
    title,
    description,
  }: { sourceUrl: string | null; overrideImageUrl?: string | null; title?: string; description?: string | null },
): Promise<'sourced' | 'none'> {
  const sharedListingPage = sourceUrl && title ? await isSharedListingPage(sourceUrl, eventId, title) : false
  const pageCandidates = [
    ...(overrideImageUrl ? [{ url: overrideImageUrl, isLogo: false }] : []),
    ...(sourceUrl && !sharedListingPage ? await extractPageImageCandidates(sourceUrl) : []),
  ]

  for (const candidate of pageCandidates) {
    if (title && (await isAlreadyClaimedImage(candidate.url, eventId, title))) continue
    const downloaded = await fetchExternalImage(candidate.url)
    if (!downloaded) continue
    if (await isLowQualityImage(downloaded, { isLogo: candidate.isLogo })) continue

    const { key, thumbnailKey } = await uploadImage(downloaded, 'events')
    // Non-null: uploadImage() always returns a real key, so imageUrl() (only
    // ever null for a falsy key) can't actually be null here.
    await db
      .update(events)
      .set({ imageUrl: imageUrl(key)!, thumbnailUrl: imageUrl(thumbnailKey)!, sourceImageUrl: candidate.url, updatedAt: new Date() })
      .where(eq(events.id, eventId))

    return 'sourced'
  }

  if (title) {
    for (const url of await searchWebImage(title, description)) {
      if (await isAlreadyClaimedImage(url, eventId, title)) continue
      const downloaded = await fetchExternalImage(url)
      if (!downloaded) continue
      if (await isLowQualityImage(downloaded)) continue

      const { key, thumbnailKey } = await uploadImage(downloaded, 'events')
      await db
        .update(events)
        .set({ imageUrl: imageUrl(key)!, thumbnailUrl: imageUrl(thumbnailKey)!, sourceImageUrl: url, updatedAt: new Date() })
        .where(eq(events.id, eventId))

      return 'sourced'
    }
  }

  return 'none'
}

const ENRICH_CONCURRENCY = 5

// Runs enrichEventImage across a batch of events with bounded concurrency —
// each one is a network fetch + image processing, so running them serially
// would make ingesting/backfilling N events take N times as long.
export async function enrichEventImages(
  rows: { id: string; sourceUrl: string | null; imageUrl?: string | null; title?: string; description?: string | null }[],
): Promise<{ sourced: number; none: number }> {
  let sourced = 0
  let none = 0
  let index = 0

  async function worker() {
    while (index < rows.length) {
      const row = rows[index++]
      try {
        const result = await enrichEventImage(row.id, {
          sourceUrl: row.sourceUrl,
          overrideImageUrl: row.imageUrl,
          title: row.title,
          description: row.description,
        })
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
