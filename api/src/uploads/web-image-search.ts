import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import { fetchWithTimeout } from './fetch-with-timeout.js'

const FETCH_TIMEOUT_MS = 10_000
const REAL_PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

const QUERY_SYSTEM_PROMPT = `You turn an event's title (and optional description) into image-search phrases for a stock-photo-style search engine (Wikimedia Commons).

Rules:
- Provide exactly 3 phrases, from most specific/descriptive to most generic, e.g. for a craft workshop: ["denim upcycling craft workshop", "craft workshop", "crafts"].
- The most generic phrase should be just 1-2 common, everyday words — real photo libraries are tagged with plain, widely-used terms (e.g. "food festival", "live music", "spa"), not precise multi-word descriptions, which routinely return nothing.
- Never include a specific person, business, school, or organization's own name — a generic photo library won't have a photo of that exact place.
- Prefer concrete, photographable nouns over abstract event-type words.

Respond with ONLY a JSON array of exactly 3 strings, no markdown fences, no explanation.`

// Derives generic, photographable search phrases from a specific event title
// — "Grades K-2 Curriculum Night" becomes something like ["school open house
// classroom", "parent teacher meeting", "classroom"], not a literal search
// for that exact event, since no stock photo library has a photo of one
// specific school's own curriculum night. Three phrases of decreasing
// specificity, not just one: found by direct testing (2026-09-04) that
// Wikimedia Commons' own search ranking is patchy for precise multi-word
// phrases ("street food festival tasting crawl" returned zero real photos
// in its top 20 hits, all old book scans) but reliable for the same subject
// phrased plainly ("food festival" returned dozens) — searchWebImage() below
// tries each phrase in order and stops at the first that yields any real
// photo candidates, rather than trusting a single guess. Same best-effort
// posture as title-normalization.ts: any failure just falls back to a
// single-element array of the raw title.
async function deriveImageSearchQueries(title: string, description?: string | null): Promise<string[]> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return [title]

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 150,
      output_config: { effort: 'low' },
      system: QUERY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify({ title, description: description ?? null }) }],
    })

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return [title]
    const block = response.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return [title]

    const parsed = JSON.parse(stripJsonCodeFence(raw))
    const queries = Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === 'string' && q.trim() !== '') : []
    return queries.length > 0 ? queries : [title]
  } catch {
    return [title]
  }
}

interface CommonsSearchResponse {
  query?: { search?: { title: string }[] }
}

interface CommonsImageInfoResponse {
  query?: {
    pages?: Record<string, { imageinfo?: { url?: string; mime?: string }[] }>
  }
}

// Runs one query against Commons' search API and resolves the top real-photo
// hits to actual downloadable URLs. Returns [] on any failure or on a query
// that turns up no real-photo-extension results (e.g. only book-scan PDFs) —
// the caller tries progressively more generic queries in that case.
async function searchCommonsForQuery(query: string): Promise<string[]> {
  const searchUrl = new URL('https://commons.wikimedia.org/w/api.php')
  searchUrl.searchParams.set('action', 'query')
  searchUrl.searchParams.set('list', 'search')
  searchUrl.searchParams.set('srnamespace', '6') // File: namespace only
  searchUrl.searchParams.set('srsearch', query)
  searchUrl.searchParams.set('srlimit', '20')
  searchUrl.searchParams.set('format', 'json')
  searchUrl.searchParams.set('origin', '*')

  const searchResponse = await fetchWithTimeout(searchUrl.toString(), FETCH_TIMEOUT_MS)
  if (!searchResponse || !searchResponse.ok) return []
  const searchResult = (await searchResponse.json()) as CommonsSearchResponse

  // Commons search returns plenty of scanned-book PDFs/diagrams for a query
  // like this — restrict to titles that at least look like real photos
  // before spending an API call resolving their URLs.
  const photoTitles = (searchResult.query?.search ?? [])
    .map((r) => r.title)
    .filter((t) => REAL_PHOTO_EXTENSIONS.some((ext) => t.toLowerCase().endsWith(ext)))
    .slice(0, 5)
  if (photoTitles.length === 0) return []

  // One imageinfo call per title, rather than a single batched call keyed on
  // titles — a batched response's pages object is keyed by page id, not
  // title, and reconstructing relevance order from it means matching titles
  // back out through the returned URL's filename, which breaks the moment a
  // URL carries query-string tracking params. Up to 5 small requests is
  // cheap; getting the order right by construction is worth it.
  const urls: string[] = []
  for (const photoTitle of photoTitles) {
    const infoUrl = new URL('https://commons.wikimedia.org/w/api.php')
    infoUrl.searchParams.set('action', 'query')
    infoUrl.searchParams.set('titles', photoTitle)
    infoUrl.searchParams.set('prop', 'imageinfo')
    infoUrl.searchParams.set('iiprop', 'url|mime')
    infoUrl.searchParams.set('format', 'json')
    infoUrl.searchParams.set('origin', '*')

    const infoResponse = await fetchWithTimeout(infoUrl.toString(), FETCH_TIMEOUT_MS)
    if (!infoResponse || !infoResponse.ok) continue
    const infoResult = (await infoResponse.json()) as CommonsImageInfoResponse
    const page = Object.values(infoResult.query?.pages ?? {})[0]
    const info = page?.imageinfo?.[0]
    if (info?.url && info.mime?.startsWith('image/') && info.mime !== 'image/svg+xml') {
      urls.push(info.url)
    }
  }

  return urls
}

// Wikimedia Commons' public, keyless search API (same "no secret required"
// posture as movie-poster-lookup.ts's Wikipedia calls) — a real library of
// millions of freely-licensed photos, reachable without any new API key or
// Railway env var. Returns real photo URLs in relevance order for the caller
// (image-enrichment.ts) to download and quality-check itself, same as every
// other candidate-list source in this pipeline — never trusted blindly. Tries
// each of deriveImageSearchQueries()'s phrases (most specific first) in turn,
// stopping at the first one that resolves to any real photo — see that
// function's own header for why a single query attempt isn't reliable enough.
export async function searchWebImage(title: string, description?: string | null): Promise<string[]> {
  try {
    for (const query of await deriveImageSearchQueries(title, description)) {
      const urls = await searchCommonsForQuery(query)
      if (urls.length > 0) return urls
    }
    return []
  } catch {
    return []
  }
}
