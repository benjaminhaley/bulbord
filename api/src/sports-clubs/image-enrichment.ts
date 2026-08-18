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
// own copy of camps/image-enrichment.ts's same posture, built on the same
// generic api/src/uploads/ infra (not events/camps-specific), since Sports &
// Clubs is a deliberately non-shared clone (see CLAUDE.md). Keyed by source
// page rather than by listing, same reasoning as camps: a provider's real
// photo/logo is genuinely the same for every activity at that venue, so
// callers fetch once per source and apply the result to every listing
// sharing it.
//
// Takes a LIST of candidate pages, not just one, for the same reason camps'
// version does — a provider's primary page (often JS-rendered or with no
// usable og:image) can fail while a secondary page (an About page, a
// Facebook page) has a real, on-topic photo. Every page's candidates are
// gathered in order and tried in sequence.
export async function enrichSportsClubSourceImage(sourceUrls: string[]): Promise<EnrichedImage | null> {
  const candidates = (await Promise.all(sourceUrls.map((url) => extractPageImageCandidates(url)))).flat()

  for (const candidate of candidates) {
    const downloaded = await fetchExternalImage(candidate.url)
    if (!downloaded) continue
    if (await isLowQualityImage(downloaded, { isLogo: candidate.isLogo })) continue

    const { key, thumbnailKey } = await uploadImage(downloaded, 'sportsclubs')
    const fullUrl = imageUrl(key)
    const thumbUrl = imageUrl(thumbnailKey)
    if (!fullUrl || !thumbUrl) continue
    return { imageUrl: fullUrl, thumbnailUrl: thumbUrl }
  }

  return null
}
