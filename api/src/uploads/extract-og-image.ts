import * as cheerio from 'cheerio'

import { fetchWithTimeout } from './fetch-with-timeout.js'

const FETCH_TIMEOUT_MS = 10_000

// Best-effort: tries og:image, then twitter:image. Returns null on any
// failure (unreachable page, no meta tag, non-HTML response) rather than
// throwing, since this is an opportunistic enrichment step during ingestion.
export async function extractOgImageUrl(pageUrl: string): Promise<string | null> {
  const response = await fetchWithTimeout(pageUrl, FETCH_TIMEOUT_MS)
  if (!response || !response.ok) return null

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('html')) return null

  try {
    const html = await response.text()
    const $ = cheerio.load(html)
    const imageUrl =
      $('meta[property="og:image"]').attr('content') ?? $('meta[name="twitter:image"]').attr('content') ?? null
    if (!imageUrl) return null

    return new URL(imageUrl, pageUrl).toString()
  } catch {
    return null
  }
}
