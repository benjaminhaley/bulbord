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

// Any failure (corrupt/unreadable buffer, missing dimensions) counts as low
// quality — same "don't show anything fake/broken" posture as the rest of
// this pipeline.
export async function isLowQualityImage(buffer: Buffer): Promise<boolean> {
  try {
    const { width, height } = await sharp(buffer).metadata()
    if (!width || !height) return true
    if (width < MIN_IMAGE_DIMENSION_PX || height < MIN_IMAGE_DIMENSION_PX) return true
    if (Math.max(width / height, height / width) > MAX_IMAGE_ASPECT_RATIO) return true
    return false
  } catch {
    return true
  }
}
