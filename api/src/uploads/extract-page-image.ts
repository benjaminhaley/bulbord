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

// Scopes image search to the page's actual content — <article>, falling
// back to <main>, falling back to the whole document for pages without
// semantic markup — so sidebar/widget images (e.g. a "related posts" list)
// never get mistaken for the page's own image.
function contentRoot($: cheerio.CheerioAPI): cheerio.Cheerio<any> {
  const article = $('article').first()
  if (article.length) return article
  const main = $('main').first()
  if (main.length) return main
  return $.root()
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

// Picks the best <img> within root: the largest by declared width×height if
// any have dimensions, otherwise the first one encountered. Filters out
// obvious logos/icons by filename.
function imageFromContent($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>, pageUrl: string): string | null {
  let firstCandidate: string | null = null
  let best: { url: string; area: number } | null = null

  for (const el of root.find('img').toArray()) {
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

// Last-resort fallback for pages with no content image of their own (e.g. a
// plain meeting-notice post): the site's own header logo. Unlike
// imageFromContent, this deliberately does NOT skip logo-looking images —
// the org's branding is a more meaningful image than no image at all.
function siteLogo($: cheerio.CheerioAPI, pageUrl: string): string | null {
  const header = $('header').first()
  const scope: cheerio.Cheerio<any> = header.length ? header : $.root()
  const src = scope.find('img').first().attr('src')
  return src ? resolveUrl(src, pageUrl) : null
}

// Best-effort, in priority order: og:image/twitter:image meta tags, a
// schema.org JSON-LD "image", a WordPress featured image (the near-universal
// `wp-post-image` class), the best plain <img> in the page content, then the
// site's own header logo. Returns null (never throws) on any failure — this
// is opportunistic ingestion-time enrichment, not a guaranteed lookup.
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

    const root = contentRoot($)

    const featuredImage = root.find('img.wp-post-image').first().attr('src')
    if (featuredImage) return resolveUrl(featuredImage, pageUrl)

    const contentImage = imageFromContent($, root, pageUrl)
    if (contentImage) return contentImage

    return siteLogo($, pageUrl)
  } catch {
    return null
  }
}
