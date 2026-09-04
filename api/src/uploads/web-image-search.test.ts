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
