import { extractPageImageCandidates } from '../uploads/extract-page-image.js'
import { fetchExternalImage } from '../uploads/fetch-external-image.js'
import { isLowQualityImage } from '../uploads/image-quality.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'

export interface EnrichedImage {
  imageUrl: string
  thumbnailUrl: string
}

// Downloads and quality-checks every candidate image found on a provider's
// page(s) in priority order (og:image, JSON-LD, WordPress featured image,
// best plain <img>, site logo) rather than trusting the first one found —
// own copy of events/image-enrichment.ts's same posture, built on the same
// generic api/src/uploads/ infra (not events-specific), since camps is a
// deliberately non-shared clone (see CLAUDE.md). Unlike events, this is
// keyed by source page rather than by listing: a camp source's real photo/
// logo is genuinely the same for every camp at that venue, so callers fetch
// once per source and apply the result to every camp sharing it, rather than
// re-fetching the same page once per camp.
//
// Takes a LIST of candidate pages, not just one (added 2026-08-05 after
// Unicoi Art Studio's Facebook page — the fallback used for two other
// providers whose own sites lazy-load images via JS — turned out to have no
// usable og:image at all, silently leaving the camp imageless even though
// their own site's About page has a real, on-topic photo). Every page's
// candidates are gathered in order and tried in sequence — same "never
// settle for the first thing that looks plausible, keep a next-best
// fallback" rule the events-side image pipeline already follows, just
// applied across whole pages instead of within one page's candidate list.
export async function enrichCampSourceImage(sourceUrls: string[]): Promise<EnrichedImage | null> {
  const candidates = (await Promise.all(sourceUrls.map((url) => extractPageImageCandidates(url)))).flat()

  for (const candidateUrl of candidates) {
    const downloaded = await fetchExternalImage(candidateUrl)
    if (!downloaded) continue
    if (await isLowQualityImage(downloaded)) continue

    const { key, thumbnailKey } = await uploadImage(downloaded, 'camps')
    const fullUrl = imageUrl(key)
    const thumbUrl = imageUrl(thumbnailKey)
    if (!fullUrl || !thumbUrl) continue
    return { imageUrl: fullUrl, thumbnailUrl: thumbUrl }
  }

  return null
}
