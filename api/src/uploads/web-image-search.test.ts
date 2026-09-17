import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()
const fetchWithTimeoutMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: createMock }
  }
  return { default: MockAnthropic }
})
vi.mock('./fetch-with-timeout.js', () => ({ fetchWithTimeout: fetchWithTimeoutMock }))

function textResponse(text: string, stopReason = 'end_turn') {
  return { stop_reason: stopReason, content: [{ type: 'text', text }] }
}

function queriesResponse(queries: string[]) {
  return textResponse(JSON.stringify(queries))
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body }
}

function commonsSearchResponse(titles: string[]) {
  return jsonResponse({ query: { search: titles.map((title) => ({ title })) } })
}

function commonsImageInfoResponse(pageId: string, url: string, mime: string) {
  return jsonResponse({ query: { pages: { [pageId]: { imageinfo: [{ url, mime }] } } } })
}

describe('searchWebImage', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    fetchWithTimeoutMock.mockReset()
    vi.resetModules()
  })

  it('derives queries, searches Commons with the first one, and returns real photo URLs in order', async () => {
    createMock.mockResolvedValue(queriesResponse(['parent teacher meeting classroom', 'classroom', 'school']))
    fetchWithTimeoutMock
      .mockResolvedValueOnce(
        commonsSearchResponse(['File:Parent teacher meeting.jpg', 'File:Some scanned book (IA book123).pdf', 'File:Classroom photo.png']),
      )
      .mockResolvedValueOnce(commonsImageInfoResponse('1', 'https://upload.wikimedia.org/a.jpg', 'image/jpeg'))
      .mockResolvedValueOnce(commonsImageInfoResponse('2', 'https://upload.wikimedia.org/b.png', 'image/png'))
    const { searchWebImage } = await import('./web-image-search.js')

    const result = await searchWebImage('Grades K-2 Curriculum Night')

    expect(result).toEqual(['https://upload.wikimedia.org/a.jpg', 'https://upload.wikimedia.org/b.png'])
    // Only the first (most specific) query needed to be tried.
    const firstCallUrl = new URL(fetchWithTimeoutMock.mock.calls[0][0] as string)
    expect(firstCallUrl.searchParams.get('srsearch')).toBe('parent teacher meeting classroom')
  })

  it('falls through to a more generic query when a specific one finds no real photos', async () => {
    // Real 2026-09-04 finding: Commons' own search ranking is patchy for
    // precise multi-word phrases (returns only book-scan PDFs) but reliable
    // for the same subject phrased plainly.
    createMock.mockResolvedValue(queriesResponse(['denim upcycling craft workshop', 'craft workshop', 'crafts']))
    fetchWithTimeoutMock
      .mockResolvedValueOnce(commonsSearchResponse(['File:Old book scan (IA x).pdf']))
      .mockResolvedValueOnce(commonsSearchResponse(['File:Craft Workshop.jpg']))
      .mockResolvedValueOnce(commonsImageInfoResponse('1', 'https://upload.wikimedia.org/craft.jpg', 'image/jpeg'))
    const { searchWebImage } = await import('./web-image-search.js')

    const result = await searchWebImage('A Craft Series September: Jeanius', 'Community craft series event.')

    expect(result).toEqual(['https://upload.wikimedia.org/craft.jpg'])
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(3)
    expect(new URL(fetchWithTimeoutMock.mock.calls[0][0] as string).searchParams.get('srsearch')).toBe(
      'denim upcycling craft workshop',
    )
    expect(new URL(fetchWithTimeoutMock.mock.calls[1][0] as string).searchParams.get('srsearch')).toBe('craft workshop')
  })

  it('returns an empty array when every query strikes out', async () => {
    createMock.mockResolvedValue(queriesResponse(['a', 'b']))
    fetchWithTimeoutMock.mockResolvedValueOnce(commonsSearchResponse([])).mockResolvedValueOnce(commonsSearchResponse([]))
    const { searchWebImage } = await import('./web-image-search.js')

    expect(await searchWebImage('Anything')).toEqual([])
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to a single query of the raw title when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    fetchWithTimeoutMock.mockResolvedValueOnce(commonsSearchResponse([]))
    const { searchWebImage } = await import('./web-image-search.js')

    await searchWebImage('Curriculum Night')

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1)
    expect(new URL(fetchWithTimeoutMock.mock.calls[0][0] as string).searchParams.get('srsearch')).toBe('Curriculum Night')
  })

  it('excludes non-photo results (svg, pdf) from the candidate list', async () => {
    createMock.mockResolvedValue(queriesResponse(['anything']))
    fetchWithTimeoutMock.mockResolvedValueOnce(commonsSearchResponse(['File:Diagram.svg', 'File:Book scan (IA x).pdf']))
    const { searchWebImage } = await import('./web-image-search.js')

    expect(await searchWebImage('Anything')).toEqual([])
    // Only the initial search call — no imageinfo call for either non-photo result.
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array when the search request fails', async () => {
    createMock.mockResolvedValue(queriesResponse(['anything']))
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({}, false))
    const { searchWebImage } = await import('./web-image-search.js')

    expect(await searchWebImage('Anything')).toEqual([])
  })

  it('returns an empty array and does not throw on an unexpected error', async () => {
    createMock.mockResolvedValue(queriesResponse(['anything']))
    fetchWithTimeoutMock.mockRejectedValueOnce(new Error('boom'))
    const { searchWebImage } = await import('./web-image-search.js')

    expect(await searchWebImage('Anything')).toEqual([])
  })

  it('falls back to a single query of the raw title when the model response is malformed', async () => {
    createMock.mockResolvedValue(textResponse('not json'))
    fetchWithTimeoutMock.mockResolvedValueOnce(commonsSearchResponse([]))
    const { searchWebImage } = await import('./web-image-search.js')

    await searchWebImage('Curriculum Night')

    expect(new URL(fetchWithTimeoutMock.mock.calls[0][0] as string).searchParams.get('srsearch')).toBe('Curriculum Night')
  })
})

describe('findBroaderImageSearchPages', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    vi.resetModules()
  })

  it('returns the real page URLs the model found via web search', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify(['https://news.example.com/article', 'https://venue.example.com/events'])))
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    const result = await findBroaderImageSearchPages('Fall Festival', 'A community fall festival')

    expect(result).toEqual(['https://news.example.com/article', 'https://venue.example.com/events'])
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }] }),
      expect.anything(),
    )
  })

  // Feedback #169 follow-up (2026-09-16): an admin's own retry note is
  // threaded into the search itself, not just corrected text fields.
  it('includes a given admin note in the request payload', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify(['https://venue.example.com/poster'])))
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    await findBroaderImageSearchPages('Fall Festival', 'A community fall festival', 'look up the official poster')

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: JSON.stringify({ title: 'Fall Festival', description: 'A community fall festival', admin_note: 'look up the official poster' }) }],
      }),
      expect.anything(),
    )
  })

  it('sends a null admin_note when no note is given', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify([])))
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    await findBroaderImageSearchPages('Fall Festival')

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: JSON.stringify({ title: 'Fall Festival', description: null, admin_note: null }) }],
      }),
      expect.anything(),
    )
  })

  it('filters out anything that is not a real http(s) URL', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify(['https://real.example.com/page', 'not-a-url', 42, null])))
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    expect(await findBroaderImageSearchPages('Fall Festival')).toEqual(['https://real.example.com/page'])
  })

  it('returns an empty array when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    expect(await findBroaderImageSearchPages('Fall Festival')).toEqual([])
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns an empty array on a refusal', async () => {
    createMock.mockResolvedValue({ stop_reason: 'refusal', content: [] })
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    expect(await findBroaderImageSearchPages('Fall Festival')).toEqual([])
  })

  it('returns an empty array and does not throw on an unexpected error', async () => {
    createMock.mockRejectedValue(new Error('boom'))
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    expect(await findBroaderImageSearchPages('Fall Festival')).toEqual([])
  })

  it('returns an empty array when the model response is malformed JSON and no search results exist to fall back on', async () => {
    createMock.mockResolvedValue(textResponse('not json'))
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    expect(await findBroaderImageSearchPages('Fall Festival')).toEqual([])
  })

  // Real incident (feedback #169 follow-up, 2026-09-17, "it didn't actually
  // do what my note requested"): a long, specific note sent the model into
  // an extended research spiral that hit the tool's own server-side rate
  // limit ("Server tool use limit exceeded during code execution") and gave
  // up with a bare `[]`, discarding several genuinely on-topic pages it had
  // already found via real web_search calls earlier in the same turn.
  function webSearchToolResult(urls: string[]) {
    return { type: 'web_search_tool_result', content: urls.map((url) => ({ type: 'web_search_result', title: 'A result', url })) }
  }

  it('falls back to the raw search results when the model gives up with an empty array despite finding real pages', async () => {
    createMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [
        webSearchToolResult(['https://do312.com/events/urban-birding-festival', 'https://theurbanbirdingfestival.org/']),
        { type: 'text', text: '[]' },
      ],
    })
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    const result = await findBroaderImageSearchPages('Urban Birding Festival')

    expect(result).toEqual(['https://do312.com/events/urban-birding-festival', 'https://theurbanbirdingfestival.org/'])
  })

  it('falls back to the raw search results when the final text is missing entirely', async () => {
    createMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [webSearchToolResult(['https://news.example.com/coverage'])],
    })
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    expect(await findBroaderImageSearchPages('Fall Festival')).toEqual(['https://news.example.com/coverage'])
  })

  it('does not fall back when the model already returned real URLs of its own', async () => {
    createMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [
        webSearchToolResult(['https://irrelevant.example.com/', 'https://also-irrelevant.example.com/']),
        { type: 'text', text: JSON.stringify(['https://the-real-pick.example.com/']) },
      ],
    })
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    expect(await findBroaderImageSearchPages('Fall Festival')).toEqual(['https://the-real-pick.example.com/'])
  })

  it('deduplicates and caps the fallback at 5 URLs', async () => {
    const urls = Array.from({ length: 8 }, (_, i) => `https://example.com/page-${i}`)
    createMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [webSearchToolResult([...urls, urls[0]]), { type: 'text', text: '[]' }],
    })
    const { findBroaderImageSearchPages } = await import('./web-image-search.js')

    const result = await findBroaderImageSearchPages('Fall Festival')

    expect(result).toEqual(urls.slice(0, 5))
  })
})
