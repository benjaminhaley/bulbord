import { fetchWithTimeout } from '../uploads/fetch-with-timeout.js'

const FETCH_TIMEOUT_MS = 10_000

interface WikipediaSearchResponse {
  query?: { search?: { title: string }[] }
}

interface WikipediaPageSummaryResponse {
  thumbnail?: { source: string }
}

// Looks up a film's official poster via Wikipedia's public, keyless API — no
// secret required, unlike title-normalization.ts/resourcing.ts's Claude
// calls. Built specifically for "Movie Night: <film>" events (see ingest.ts):
// their source_url is one shared listing page with no per-occurrence image of
// its own, so generic page-scrape extraction (extract-page-image.ts) can't
// tell one screening's film apart from another's and was landing on a
// generic venue graphic or an unrelated site's logo instead (see
// fix-2026-08-03-movie-night-posters.ts). Two calls: the legacy search API
// resolves a bare title to the exact disambiguated page (e.g. "National
// Treasure" alone hits the "national treasure" concept page, not the film —
// searching "National Treasure film" finds "National Treasure (film)"); the
// REST summary endpoint (not the legacy pageimages API, which deliberately
// excludes non-free/fair-use images — and nearly every theatrical poster is
// one) then returns that resolved page's real infobox poster. Best-effort
// like every other sourcing helper in this codebase: any failure (no search
// hit, no page thumbnail, network error) degrades to null rather than
// throwing, so a lookup miss never blocks ingestion — image-enrichment.ts
// falls back to its normal page-extraction path when this returns null.
export async function lookupMoviePoster(movieTitle: string): Promise<string | null> {
  try {
    const searchUrl = new URL('https://en.wikipedia.org/w/api.php')
    searchUrl.searchParams.set('action', 'query')
    searchUrl.searchParams.set('list', 'search')
    searchUrl.searchParams.set('srsearch', `${movieTitle} film`)
    searchUrl.searchParams.set('srlimit', '1')
    searchUrl.searchParams.set('format', 'json')
    searchUrl.searchParams.set('origin', '*')

    const searchResponse = await fetchWithTimeout(searchUrl.toString(), FETCH_TIMEOUT_MS)
    if (!searchResponse || !searchResponse.ok) return null
    const searchResult = (await searchResponse.json()) as WikipediaSearchResponse
    const pageTitle = searchResult.query?.search?.[0]?.title
    if (!pageTitle) return null

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`
    const summaryResponse = await fetchWithTimeout(summaryUrl, FETCH_TIMEOUT_MS)
    if (!summaryResponse || !summaryResponse.ok) return null
    const summaryResult = (await summaryResponse.json()) as WikipediaPageSummaryResponse
    return summaryResult.thumbnail?.source ?? null
  } catch {
    return null
  }
}
