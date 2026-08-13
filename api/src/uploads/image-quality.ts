import sharp from 'sharp'

// Catches the two failure shapes seen in production sourcing (see CLAUDE.md's
// Images & object storage): a site's tiny logo/badge (dimensions far too
// small to be a real photo — e.g. a 258x21 site-header strip) and a
// banner-shaped crop (extreme aspect ratio, even when one dimension alone
// clears the size floor). Deliberately loose enough to pass genuinely small
// but real photos — e.g. Wikipedia's fair-use movie posters, ~220-280px
// wide — while rejecting the site-chrome images that were slipping through
// unchecked before.
const MIN_IMAGE_DIMENSION_PX = 200
const MAX_IMAGE_ASPECT_RATIO = 3

// A real site logo/wordmark is routinely shorter and wider than any genuine
// content photo (e.g. the Chicago Public Library's own header logo is
// 500x120px, an aspect ratio the checks above exist specifically to catch
// as a "banner crop"). Held to a much looser bar than a real photo
// candidate — just enough to reject a degenerate tracking-pixel-sized image,
// not to demand photo-like proportions from something that was never meant
// to look like a photo. Passed only for extract-page-image.ts's siteLogo()
// fallback tier (see ImageCandidate.isLogo), never for a real content-image
// candidate (og:image, JSON-LD, WordPress featured, best plain <img>).
const LOGO_MIN_IMAGE_DIMENSION_PX = 40
const LOGO_MAX_IMAGE_ASPECT_RATIO = 10

// Any failure (corrupt/unreadable buffer, missing dimensions) counts as low
// quality — same "don't show anything fake/broken" posture as the rest of
// this pipeline.
export async function isLowQualityImage(buffer: Buffer, options?: { isLogo?: boolean }): Promise<boolean> {
  const minDimension = options?.isLogo ? LOGO_MIN_IMAGE_DIMENSION_PX : MIN_IMAGE_DIMENSION_PX
  const maxAspectRatio = options?.isLogo ? LOGO_MAX_IMAGE_ASPECT_RATIO : MAX_IMAGE_ASPECT_RATIO
  try {
    const { width, height } = await sharp(buffer).metadata()
    if (!width || !height) return true
    if (width < minDimension || height < minDimension) return true
    if (Math.max(width / height, height / width) > maxAspectRatio) return true
    return false
  } catch {
    return true
  }
}
