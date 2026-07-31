import * as cheerio from 'cheerio'

import { fetchWithTimeout } from './fetch-with-timeout.js'

const FETCH_TIMEOUT_MS = 10_000
const MIN_CONTENT_IMAGE_AREA = 150 * 150
const SKIP_SRC_PATTERN = /logo|icon|sprite|avatar/i
// Schema.org types likely to carry an image for the specific thing the page
// is about. Deliberately excludes WebSite/Organization — those usually carry
// a site logo under "image"/"logo", not the page's own content image.
const JSON_LD_TYPES_WITH_CONTENT_IMAGE = new Set(['Event', 'Article', 'NewsArticle', 'BlogPosting', 'Product'])

function resolveUrl(url: string, base: string): string | null {
  try {
    return new URL(url, base).toString()
  } catch {
    return null
  }
}

function imageFromJsonLd($: cheerio.CheerioAPI, pageUrl: string): string | null {
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    let data: unknown
    try {
      data = JSON.parse($(script).contents().text())
    } catch {
      continue
    }

    for (const item of Array.isArray(data) ? data : [data]) {
      if (typeof item !== 'object' || item === null) continue
      const record = item as Record<string, unknown>
      if (!JSON_LD_TYPES_WITH_CONTENT_IMAGE.has(String(record['@type']))) continue

      const image = record.image
      const url = typeof image === 'string' ? image : Array.isArray(image) ? image[0] : (image as { url?: string })?.url
      if (typeof url === 'string') return resolveUrl(url, pageUrl)
    }
  }
  return null
}

// Picks the best content <img> outside header/nav/footer chrome: the
// largest by declared width×height if any have dimensions, otherwise the
// first one encountered. Filters out obvious logos/icons by filename.
function imageFromContent($: cheerio.CheerioAPI, pageUrl: string): string | null {
  $('header, nav, footer').remove()

  let firstCandidate: string | null = null
  let best: { url: string; area: number } | null = null

  for (const el of $('img').toArray()) {
    const src = $(el).attr('src')
    if (!src || SKIP_SRC_PATTERN.test(src)) continue
    const resolved = resolveUrl(src, pageUrl)
    if (!resolved) continue

    firstCandidate ??= resolved

    const width = Number($(el).attr('width'))
    const height = Number($(el).attr('height'))
    if (!width || !height) continue
    const area = width * height
    if (area >= MIN_CONTENT_IMAGE_AREA && (!best || area > best.area)) {
      best = { url: resolved, area }
    }
  }

  return best?.url ?? firstCandidate
}

// Best-effort, in priority order: og:image/twitter:image meta tags, a
// schema.org JSON-LD "image", a WordPress featured image (the near-universal
// `wp-post-image` class), then the best plain <img> in the page content.
// Returns null (never throws) on any failure — this is opportunistic
// ingestion-time enrichment, not a guaranteed lookup.
export async function extractPageImageUrl(pageUrl: string): Promise<string | null> {
  const response = await fetchWithTimeout(pageUrl, FETCH_TIMEOUT_MS)
  if (!response || !response.ok) return null

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('html')) return null

  try {
    const html = await response.text()
    const $ = cheerio.load(html)

    const metaImage =
      $('meta[property="og:image"]').attr('content') ?? $('meta[name="twitter:image"]').attr('content') ?? null
    if (metaImage) return resolveUrl(metaImage, pageUrl)

    const jsonLdImage = imageFromJsonLd($, pageUrl)
    if (jsonLdImage) return jsonLdImage

    const featuredImage = $('img.wp-post-image').first().attr('src')
    if (featuredImage) return resolveUrl(featuredImage, pageUrl)

    return imageFromContent($, pageUrl)
  } catch {
    return null
  }
}
