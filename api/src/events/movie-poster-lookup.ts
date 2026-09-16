import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
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

const IDENTIFY_SYSTEM_PROMPT = `You look at a family-events listing's title and description and decide whether it's fundamentally a public screening/showing of one specific, real, identifiable film (a movie, or a TV/streaming special that has its own real poster/key art) — as opposed to a movie night with no named film, a live performance, a lecture, a book club, or anything else that just happens to mention a film in passing.

Rules:
- Only say yes when a specific, real film is actually named — never guess or invent one.
- Return the film's own canonical title exactly as it's commonly known (e.g. "Clifford the Big Red Dog", not "the library's film screening") — include a release year in parentheses only when it's genuinely needed to disambiguate two different films/versions with the same title (e.g. a specific older or remade version).
- Say no for anything without one specific named film: a themed movie night ("Family Movie Night" with no title given), a screening of user-made or unreleased content, a director talk, a discussion series, etc.

Respond with ONLY a JSON object: {"isFilmScreening": true|false, "filmTitle": string|null}. No markdown fences, no explanation.`

interface FilmScreeningIdentification {
  isFilmScreening?: unknown
  filmTitle?: unknown
}

// Feedback #169 follow-up (2026-09-16, "why would this one fail... you need
// to revisit the pipeline logic"): the real recurring bug here was never
// "the search doesn't try hard enough" — it's that a specific, well-known
// film has a real, authoritative official poster available (via
// lookupMoviePoster above), but nothing in the general search pipeline ever
// knew to look for it, because the only thing that ever triggered a poster
// lookup was ingest.ts's own hardcoded `/^Movie Night: /` title-prefix
// regex. That regex already needed one-off patching once before (see
// fix-2026-09-05-petes-dragon-poster.ts, "Indoor Kids: Pete's Dragon" never
// matched it either) and still couldn't catch "Film Screening: Clifford the
// Big Red Dog" — a brittle string pattern will always eventually meet a
// phrasing it doesn't cover, the same way every other judgment call in this
// pipeline (title quality, image relevance, audience relevance) is already
// a real LLM decision rather than a hardcoded pattern. This replaces the
// regex with the same kind of judgment call, reading the full title AND
// description (so it also catches a film named only in the description,
// not just a specific title convention) — and, crucially, is called from
// image-enrichment.ts's own general findImageCandidate() rather than only
// from ingest.ts's initial-insert path, so a member's own post, an edit, or
// an admin retry all get the same real-poster treatment a fresh ingestion
// does, not just the one entry point this bug happened to be noticed on.
export async function identifyFilmScreening(title: string, description?: string | null): Promise<string | null> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return null

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 150,
      output_config: { effort: 'low' },
      system: IDENTIFY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify({ title, description: description ?? null }) }],
    })

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null
    const block = response.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return null

    const parsed = JSON.parse(stripJsonCodeFence(raw)) as FilmScreeningIdentification
    if (parsed.isFilmScreening === true && typeof parsed.filmTitle === 'string' && parsed.filmTitle.trim()) {
      return parsed.filmTitle.trim()
    }
    return null
  } catch {
    return null
  }
}
