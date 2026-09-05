import * as cheerio from 'cheerio'

import { fetchWithTimeout } from './fetch-with-timeout.js'

const FETCH_TIMEOUT_MS = 10_000
const MIN_CONTENT_IMAGE_AREA = 150 * 150
const SKIP_SRC_PATTERN = /logo|icon|sprite|avatar/i
// Matches an unrendered server-template variable left in a `src` attribute
// (e.g. BiblioCommons' own header markup ships `src="{{user_avatar}}"` when
// nothing populated it) — a page can serve this as perfectly valid HTML, but
// it was never a real image and always 404s. Caught this the hard way: it
// slipped through as the ONE candidate siteLogo() below picked for a real
// CPL Merlo event, silently leaving the event imageless even though a
// genuine logo sat two images later in the same header. Checked everywhere
// a src is read, not just in siteLogo(), since any extraction path could hit
// the same kind of stub on some other site.
const TEMPLATE_PLACEHOLDER_PATTERN = /\{\{.*\}\}/
// Found 2026-09-05 auditing image-relevance.ts's new scoring results:
// gallagherway.com/img/loader.gif — a 110x130 JS loading-spinner shown
// before the page's real (lazy-loaded) images finish loading — sat in the
// page's <header> markup and was picked up by siteLogo() as "the org's
// logo," since nothing there checks whether a header <img> is actually a
// logo versus a UI-chrome asset. It then passed the loose logo-size gate
// (image-quality.ts's LOGO_MIN_IMAGE_DIMENSION_PX) and, being isLogo: true,
// skipped content-relevance scoring by design (see image-enrichment.ts) —
// so a blank loading spinner was treated exactly like a real small logo,
// with nothing anywhere positioned to catch it. Filenames matching this
// pattern are excluded everywhere isUsableSrc is checked, same as the
// template-placeholder stub above — a loading/spinner/placeholder graphic
// is never a real logo or a real content image, regardless of which tier
// would otherwise pick it.
const UI_CHROME_ASSET_PATTERN = /loader|loading|spinner/i
// Schema.org types likely to carry an image for the specific thing the page
// is about. Deliberately excludes WebSite/Organization — those usually carry
// a site logo under "image"/"logo", not the page's own content image.
const JSON_LD_TYPES_WITH_CONTENT_IMAGE = new Set(['Event', 'Article', 'NewsArticle', 'BlogPosting', 'Product'])

function isUsableSrc(src: string | undefined): src is string {
  return !!src && !TEMPLATE_PLACEHOLDER_PATTERN.test(src) && !UI_CHROME_ASSET_PATTERN.test(src)
}

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
    if (!isUsableSrc(src) || SKIP_SRC_PATTERN.test(src)) continue
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
// Scans every header <img> for the first genuinely usable one, rather than
// blindly grabbing the first — a real page's header can lead with something
// that isn't a real image at all (a template placeholder, see
// TEMPLATE_PLACEHOLDER_PATTERN) while a perfectly good logo sits right next
// to it.
function siteLogo($: cheerio.CheerioAPI, pageUrl: string): string | null {
  const header = $('header').first()
  const scope: cheerio.Cheerio<any> = header.length ? header : $.root()
  for (const el of scope.find('img').toArray()) {
    const src = $(el).attr('src')
    if (!isUsableSrc(src)) continue
    const resolved = resolveUrl(src, pageUrl)
    if (resolved) return resolved
  }
  return null
}

export interface ImageCandidate {
  url: string
  // True only for the siteLogo() fallback tier below. A real content-photo
  // candidate (og:image, JSON-LD, WordPress featured, best plain <img>) is
  // held to image-quality.ts's normal bar; a logo is held to a looser one —
  // a legitimate wordmark logo is routinely shorter/wider than any real
  // photo (see image-quality.ts's LOGO_* constants), so applying the photo
  // bar to it would reject nearly every real logo, defeating the whole
  // point of having a logo fallback.
  isLogo: boolean
}

// Best-effort, in priority order: og:image/twitter:image meta tags, a
// schema.org JSON-LD "image", a WordPress featured image (the near-universal
// `wp-post-image` class), the best plain <img> in the page content, then the
// site's own header logo. Returns every candidate found (deduped, most
// promising first) rather than just the first hit — a highest-priority tag
// can point at something unusably small (e.g. a site's tiny header badge
// misconfigured as its own og:image), so image-enrichment.ts downloads and
// quality-checks these in order and keeps going until one is actually usable
// instead of trusting the first URL found (see image-quality.ts). Returns []
// (never throws) on any failure — this is opportunistic ingestion-time
// enrichment, not a guaranteed lookup.
export async function extractPageImageCandidates(pageUrl: string): Promise<ImageCandidate[]> {
  const response = await fetchWithTimeout(pageUrl, FETCH_TIMEOUT_MS)
  if (!response || !response.ok) return []

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('html')) return []

  try {
    const html = await response.text()
    const $ = cheerio.load(html)

    const metaImageSrc =
      $('meta[property="og:image"]').attr('content') ?? $('meta[name="twitter:image"]').attr('content') ?? undefined
    const metaImage = isUsableSrc(metaImageSrc) ? resolveUrl(metaImageSrc, pageUrl) : null
    const jsonLdImage = imageFromJsonLd($, pageUrl)
    const root = contentRoot($)
    const featuredImageSrc = root.find('img.wp-post-image').first().attr('src')
    const featuredImage = isUsableSrc(featuredImageSrc) ? resolveUrl(featuredImageSrc, pageUrl) : null
    const contentImage = imageFromContent($, root, pageUrl)
    const logo = siteLogo($, pageUrl)

    const candidates: (ImageCandidate | null)[] = [
      metaImage ? { url: metaImage, isLogo: false } : null,
      jsonLdImage ? { url: jsonLdImage, isLogo: false } : null,
      featuredImage ? { url: featuredImage, isLogo: false } : null,
      contentImage ? { url: contentImage, isLogo: false } : null,
      logo ? { url: logo, isLogo: true } : null,
    ]

    const seen = new Set<string>()
    return candidates.filter((c): c is ImageCandidate => {
      if (!c || seen.has(c.url)) return false
      seen.add(c.url)
      return true
    })
  } catch {
    return []
  }
}
