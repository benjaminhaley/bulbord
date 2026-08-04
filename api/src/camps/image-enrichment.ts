import { extractPageImageCandidates } from '../uploads/extract-page-image.js'
import { fetchExternalImage } from '../uploads/fetch-external-image.js'
import { isLowQualityImage } from '../uploads/image-quality.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'

export interface EnrichedImage {
  imageUrl: string
  thumbnailUrl: string
}

// Downloads and quality-checks every candidate image found on a provider's
// page in priority order (og:image, JSON-LD, WordPress featured image, best
// plain <img>, site logo) rather than trusting the first one found — own
// copy of events/image-enrichment.ts's same posture, built on the same
// generic api/src/uploads/ infra (not events-specific), since camps is a
// deliberately non-shared clone (see CLAUDE.md). Unlike events, this is
// keyed by source page rather than by listing: a camp source's real photo/
// logo is genuinely the same for every camp at that venue, so callers fetch
// once per source and apply the result to every camp sharing it, rather than
// re-fetching the same page once per camp.
export async function enrichCampSourceImage(sourceUrl: string): Promise<EnrichedImage | null> {
  const candidates = await extractPageImageCandidates(sourceUrl)

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
