import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import { SEARCH_CALL_MAX_RETRIES, SEARCH_CALL_TIMEOUT_MS } from '../events/extraction-shared.js'
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
// stopping at the first one that resolves to any real photo.
export async function searchWebImage(title: string, description?: string | null): Promise<string[]> {
  for await (const urls of searchWebImageQueryTiers(title, description)) {
    if (urls.length > 0) return urls
  }
  return []
}

// Pipeline Review v2 (2026-09-06, "the algorithm should be searching
// harder"): searchWebImage above stops at the first query phrase that
// resolves to *any* real photo, even if every one of those photos then
// fails the caller's own relevance scoring — the broader, more-generic
// phrases (deriveImageSearchQueries returns 3, most-specific first) never
// even get tried in that case. An async generator (not an eagerly-resolved
// array) so a caller that finds a usable photo on the first tier never pays
// for the network calls the later tiers would have needed — the whole point
// of self-healing here is "try harder only when the easy path didn't work,"
// not "always do the maximum amount of work."
export async function* searchWebImageQueryTiers(title: string, description?: string | null): AsyncGenerator<string[]> {
  try {
    for (const query of await deriveImageSearchQueries(title, description)) {
      yield await searchCommonsForQuery(query)
    }
  } catch {
    // Nothing more to yield — same fail-open posture as every other
    // Claude-backed step in this pipeline.
  }
}

const BROADER_SEARCH_SYSTEM_PROMPT = `You help find a real, specific photo of an event or venue using live web search.

Given an event's title and description, search the web for pages that likely show an actual, specific photo of this event, the group/organization running it, or its venue — e.g. the host's own site, local news coverage, a community calendar listing, a past year's recap, a social media post. Prefer the most specific, most likely-to-have-a-real-photo pages your search actually returns.

Rules:
- Run at most 1-2 search queries. Do not repeat the same or a very similar query, and do not run an extensive multi-round research process — a couple of good results is enough to work with.
- Only return page URLs that genuinely appeared in your search results — never invent or guess a URL.
- Return page URLs (the article/listing/organization page itself), not direct image file links — the actual photo will be extracted from whichever page you point to.
- Return up to 5 URLs, most likely to have a real relevant photo first.
- As soon as your search returns any plausible pages, stop searching and report them — do not keep searching for a "perfect" match. If a search attempt errors or hits a limit, immediately report the best pages you already found instead of retrying or giving up.
- Return an empty array ONLY if every search you ran came back with nothing even remotely plausible — never return an empty array just because you wanted to search more.
- If admin_note is given, it's a person's own specific instructions for this search (e.g. "look for the official poster," "try the venue's Instagram") — follow it closely; it takes priority over your own default approach.

Respond with ONLY a JSON array of URL strings, no markdown fences, no explanation.`

// Feedback #169 (2026-09-16, "run a broader Google-based search"): Wikimedia
// Commons' own search above is a real, keyless stock-photo library, but it's
// thin for anything hyper-local (a specific school, a specific neighborhood
// festival) — it can only ever return generic stock photos of the general
// subject, never a photo of the actual thing. This reuses the same
// web_search tool already paid for and exercised elsewhere in this codebase
// (description-extraction.ts, photo-extraction.ts, resourcing.ts) to do a
// genuine broader web search, deliberately asking for candidate PAGE URLs
// rather than trusting the model to name a real image file URL from memory
// (a model can describe a photo it "knows about" without the URL actually
// resolving to it) — the caller (image-enrichment.ts) runs the exact same
// extractPageImageCandidates()/download/quality/relevance pipeline against
// each returned page that source_url itself already goes through, so a
// hallucinated or dead page just yields no usable candidate rather than a
// bad image slipping through unverified.
function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

// A real incident (feedback #169 follow-up, 2026-09-17, "it didn't actually
// do what my note requested... it should at least provide some response
// why, but really it should just be able to do it"): a long, specific note
// sent the model into an extended multi-round research spiral — it found
// several genuinely excellent, on-topic candidate pages early on, then kept
// searching for more, eventually hit the tool's own server-side rate limit
// ("Server tool use limit exceeded during code execution"), and gave up
// with a bare `[]` as its final answer — discarding every real result it
// had already gathered earlier in the SAME turn. The tightened prompt above
// asks it not to do this, but a model's own text summary is never fully
// reliable under a genuine tool error mid-turn, so this doesn't only trust
// that: it also pulls real URLs directly out of the raw
// `web_search_tool_result` blocks the API already returned (the same search
// results the model itself saw) as a fallback whenever the model's own
// final text comes back empty — so a real, already-completed search is
// never silently thrown away just because the model's own wrap-up failed.
function extractSearchResultUrls(content: readonly unknown[]): string[] {
  const urls: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object' || (block as { type?: unknown }).type !== 'web_search_tool_result') continue
    const items = (block as { content?: unknown }).content
    if (!Array.isArray(items)) continue
    for (const item of items) {
      const url = (item as { url?: unknown } | null)?.url
      if (isHttpUrl(url) && !urls.includes(url)) urls.push(url)
    }
  }
  return urls
}

// `note` (feedback #169 follow-up, 2026-09-16, "I should be able to retry
// again with yet another note"): an admin's own free-text instructions for
// one specific retry, threaded straight into this search — previously a
// retry's note only ever reached corrected text fields (candidate-checks.ts's
// admin_note), so an image-focused instruction like "look up the official
// poster" had no way to actually change what got searched for.
export async function findBroaderImageSearchPages(title: string, description?: string | null, note?: string | null): Promise<string[]> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return []

  try {
    const response = await anthropic.messages.create(
      {
        model: 'claude-opus-5',
        max_tokens: 1000,
        output_config: { effort: 'low' },
        system: BROADER_SEARCH_SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
        messages: [{ role: 'user', content: JSON.stringify({ title, description: description ?? null, admin_note: note?.trim() || null }) }],
      },
      { timeout: SEARCH_CALL_TIMEOUT_MS, maxRetries: SEARCH_CALL_MAX_RETRIES },
    )

    if (response.stop_reason === 'refusal') return []
    const block = [...response.content].reverse().find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''

    let urls: string[] = []
    if (raw) {
      try {
        const parsed = JSON.parse(stripJsonCodeFence(raw))
        if (Array.isArray(parsed)) urls = parsed.filter(isHttpUrl)
      } catch {
        // Fall through to the raw-search-result fallback below.
      }
    }

    return urls.length > 0 ? urls : extractSearchResultUrls(response.content).slice(0, 5)
  } catch {
    return []
  }
}
