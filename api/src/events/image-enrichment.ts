import { randomUUID } from 'node:crypto'

import { and, eq, isNull, ne } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { extractPageImageCandidates } from '../uploads/extract-page-image.js'
import { fetchExternalImage } from '../uploads/fetch-external-image.js'
import { scoreImageRelevance } from '../uploads/image-relevance.js'
import { isLowQualityImage } from '../uploads/image-quality.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'
import { searchWebImage } from '../uploads/web-image-search.js'
import { SEARCH_STAGE_DEADLINE_MS, withDeadline } from './extraction-shared.js'

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
// extractPageImageCandidates finds on the source page's actual CONTENT
// (og:image, JSON-LD, WordPress featured image, best plain <img> — NOT the
// site-logo tier, held back until last; see below), then — feedback #139,
// "the pipeline should assess image quality... find a better one" rather
// than settling for a flat placeholder the moment page-extraction comes up
// empty — a generic web image search keyed off the event's own
// title/description (see web-image-search.ts), and only THEN, as the
// genuine last resort, the source page's own site-logo candidate. Every
// candidate is downloaded and quality-checked (see image-quality.ts), and
// cross-checked against isAlreadyClaimedImage (see above), rather than
// trusted on sight: a highest-priority tag can point at something unusably
// small (a site's own tiny header badge misconfigured as its og:image) or,
// even at a passing size, at the same generic fallback another event
// already has. Since 2026-09-04 (feedback #158), a real content-relevance
// candidate is also scored against the event's own title/description via
// scoreImageRelevance() (see image-relevance.ts) — the size/aspect-ratio
// gate above only ever caught a badly-shaped image, never a real,
// well-formed photo of the WRONG thing (a hosting org's own generic
// branding photo, an unrelated stock photo). Not applied to the site-logo
// candidate, since that tier exists specifically to show generic org
// branding as a genuine last resort — scoring it against the event
// description would reject the very thing it's meant to provide.
//
// **The logo tier moved to last, 2026-09-05, after a real incident**: it
// used to sit at the end of the *page-extraction* candidate list, tried
// immediately once real content candidates were exhausted but BEFORE web
// search ever ran — so any page with a findable logo (nearly every
// BiblioCommons/library page has one) would always win over a genuinely
// better photo web search might have found, since the logo's own loose
// gate is easy to pass and it's never scored. Re-running enrichment on an
// event already stuck on a logo just kept re-selecting a logo (sometimes a
// *different* logo, which looks like progress in a diff but isn't) — this
// was flagged as a known limitation and left as "not worth a dedicated fix"
// until it kept recurring and became the actual reason a direct fix report
// ("Musical Theater Club still just has the building logo") wasn't
// resolved by simply re-running the existing pipeline. Moving the logo
// candidate to try dead last — after both real content candidates AND web
// search have been exhausted — means it only ever wins when nothing better
// exists anywhere, which is what "last resort" was always supposed to mean.
//
// Returns 'none' when nothing in the whole list passes; the caller
// (ingest.ts) has already inserted a generated solid-color placeholder to
// satisfy events.imageUrl's NOT NULL constraint, so 'none' just means that
// placeholder stays rather than being replaced by a real photo.
// One line per candidate image actually considered, kept regardless of
// outcome — added 2026-09-04 directly in response to Ben asking whether
// this pipeline outputs enough information to debug a bad image after the
// fact. Before this, a rejected candidate's URL and the reason it was
// rejected were gone the instant `continue` ran — there was no way to
// answer "why did this event end up with a placeholder" or "what else was
// considered before this photo was picked" without re-running the whole
// pipeline by hand and guessing. The caller (ingest.ts) writes this whole
// trace into the same events_ingested events_log row every other run
// summary already lands in, so it's queryable after the fact the same way
// as any other structured domain event — no new admin UI needed for it to
// exist, though a future one could read it.
interface ImageCandidateTrace {
  url: string
  outcome: 'shared_listing_page_skipped' | 'already_claimed' | 'download_failed' | 'low_quality' | 'rejected_relevance' | 'chosen'
  reason?: string
}

export interface ImageEnrichmentResult {
  result: 'sourced' | 'none'
  trace: ImageCandidateTrace[]
}

interface ImageSearchOptions {
  sourceUrl: string | null
  overrideImageUrl?: string | null
  title?: string
  description?: string | null
}

interface ChosenCandidate {
  key: string
  thumbnailKey: string
  sourceImageUrl: string
}

// The core "try every real candidate in priority order, download it,
// quality/relevance-check it, upload the first that passes" search —
// extracted out of enrichEventImage (which additionally writes the result
// onto an existing events row) so the same real search can also run for an
// event that doesn't exist yet (see findCandidateEventImage below, feedback
// #133: a member reviewing a description-flow post should see a real photo
// — or a clear "still looking"/"none found" state — before they ever tap
// Post, not just an invisible server-side mutation afterward).
//
// `eventId` is used only for the isAlreadyClaimedImage/isSharedListingPage
// self-exclusion checks below — a not-yet-created event passes a fresh
// random id that can never match a real row, so those checks behave
// identically either way (there's no "self" row to exclude from, since one
// doesn't exist yet).
async function findImageCandidate(
  eventId: string,
  { sourceUrl, overrideImageUrl, title, description }: ImageSearchOptions,
): Promise<{ chosen: ChosenCandidate | null; trace: ImageCandidateTrace[] }> {
  const trace: ImageCandidateTrace[] = []
  const sharedListingPage = sourceUrl && title ? await isSharedListingPage(sourceUrl, eventId, title) : false
  if (sharedListingPage && sourceUrl) {
    trace.push({ url: sourceUrl, outcome: 'shared_listing_page_skipped', reason: 'source_url shared by a differently-titled event' })
  }
  const extracted = sourceUrl && !sharedListingPage ? await extractPageImageCandidates(sourceUrl) : []
  const contentCandidates = [
    ...(overrideImageUrl ? [{ url: overrideImageUrl, isLogo: false }] : []),
    ...extracted.filter((c) => !c.isLogo),
  ]
  const logoCandidates = extracted.filter((c) => c.isLogo)

  // Tries one candidate list start to finish, scoring each one (unless
  // isLogo, which is never scored — see this function's own header for why)
  // and uploading+returning on the first that passes every gate. Shared by
  // all three tiers below so the priority ordering between them is just the
  // order these calls happen in, not three copies of the same loop body.
  async function tryCandidates(candidates: { url: string; isLogo: boolean }[]): Promise<ChosenCandidate | null> {
    for (const candidate of candidates) {
      if (title && (await isAlreadyClaimedImage(candidate.url, eventId, title))) {
        trace.push({ url: candidate.url, outcome: 'already_claimed' })
        continue
      }
      const downloaded = await fetchExternalImage(candidate.url)
      if (!downloaded) {
        trace.push({ url: candidate.url, outcome: 'download_failed' })
        continue
      }
      if (await isLowQualityImage(downloaded, { isLogo: candidate.isLogo })) {
        trace.push({ url: candidate.url, outcome: 'low_quality' })
        continue
      }
      if (title && !candidate.isLogo) {
        const score = await scoreImageRelevance(downloaded, { title, description })
        if (!score.keep) {
          trace.push({ url: candidate.url, outcome: 'rejected_relevance', reason: score.reason ?? undefined })
          continue
        }
      }

      const { key, thumbnailKey } = await uploadImage(downloaded, 'events')
      trace.push({ url: candidate.url, outcome: 'chosen' })
      return { key, thumbnailKey, sourceImageUrl: candidate.url }
    }
    return null
  }

  const fromContent = await tryCandidates(contentCandidates)
  if (fromContent) return { chosen: fromContent, trace }

  if (title) {
    const webCandidates = (await searchWebImage(title, description)).map((url) => ({ url, isLogo: false }))
    const fromWeb = await tryCandidates(webCandidates)
    if (fromWeb) return { chosen: fromWeb, trace }
  }

  const fromLogo = await tryCandidates(logoCandidates)
  if (fromLogo) return { chosen: fromLogo, trace }

  return { chosen: null, trace }
}

export async function enrichEventImage(eventId: string, options: ImageSearchOptions): Promise<ImageEnrichmentResult> {
  const { chosen, trace } = await findImageCandidate(eventId, options)
  if (!chosen) return { result: 'none', trace }

  // Non-null: uploadImage() always returns a real key, so imageUrl() (only
  // ever null for a falsy key) can't actually be null here.
  await db
    .update(events)
    .set({
      imageUrl: imageUrl(chosen.key)!,
      thumbnailUrl: imageUrl(chosen.thumbnailKey)!,
      sourceImageUrl: chosen.sourceImageUrl,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId))

  return { result: 'sourced', trace }
}

// A real, uploaded (but not yet attached to any row) candidate image for an
// event that doesn't exist yet — feedback #133's own review-before-post
// flow: a member describing an event should see the same real photo search
// a sourced/scraped event already gets, before they ever tap Post, not
// find out afterward (or never) that nothing was attached. Bounded by the
// same generous deadline as the description flow's own web-search stage —
// this can walk through several candidates (page extraction, then a web
// image search, then a logo fallback), each involving a download and
// possibly a Claude vision call, so it's slower than a simple field
// extraction but still needs a hard ceiling rather than risking an
// unbounded hang on a live HTTP request. Returns null (not found, or timed
// out) rather than throwing — same best-effort posture as every other
// Claude-backed step in this pipeline; the caller (POST /events) already
// has its own background enrichEventImage fallback for exactly this case.
export async function findCandidateEventImage(options: ImageSearchOptions): Promise<{ imageUrl: string; thumbnailUrl: string } | null> {
  return withDeadline(findCandidateEventImageInner(options), null, SEARCH_STAGE_DEADLINE_MS)
}

async function findCandidateEventImageInner(options: ImageSearchOptions): Promise<{ imageUrl: string; thumbnailUrl: string } | null> {
  const { chosen } = await findImageCandidate(randomUUID(), options)
  if (!chosen) return null
  return { imageUrl: imageUrl(chosen.key)!, thumbnailUrl: imageUrl(chosen.thumbnailKey)! }
}

const ENRICH_CONCURRENCY = 5

export interface EventImageTrace {
  eventId: string
  title?: string
  trace: ImageCandidateTrace[]
}

// Runs enrichEventImage across a batch of events with bounded concurrency —
// each one is a network fetch + image processing, so running them serially
// would make ingesting/backfilling N events take N times as long. Returns
// every event's own candidate trace alongside the sourced/none counts (see
// ImageCandidateTrace above) so the caller (ingest.ts) can log the full
// per-candidate reasoning, not just the aggregate counts.
export async function enrichEventImages(
  rows: { id: string; sourceUrl: string | null; imageUrl?: string | null; title?: string; description?: string | null }[],
): Promise<{ sourced: number; none: number; traces: EventImageTrace[] }> {
  let sourced = 0
  let none = 0
  let index = 0
  const traces: EventImageTrace[] = []

  async function worker() {
    while (index < rows.length) {
      const row = rows[index++]
      try {
        const { result, trace } = await enrichEventImage(row.id, {
          sourceUrl: row.sourceUrl,
          overrideImageUrl: row.imageUrl,
          title: row.title,
          description: row.description,
        })
        if (result === 'sourced') sourced++
        else none++
        traces.push({ eventId: row.id, title: row.title, trace })
      } catch (err) {
        // Leave image_url null; the next ingest/backfill pass will retry it.
        none++
        traces.push({
          eventId: row.id,
          title: row.title,
          trace: [{ url: row.sourceUrl ?? '(none)', outcome: 'download_failed', reason: err instanceof Error ? err.message : 'unknown error' }],
        })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(ENRICH_CONCURRENCY, rows.length) }, worker))
  return { sourced, none, traces }
}
