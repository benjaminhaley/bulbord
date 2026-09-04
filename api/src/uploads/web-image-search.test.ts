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

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body }
}

describe('searchWebImage', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    fetchWithTimeoutMock.mockReset()
    vi.resetModules()
  })

  it('derives a generic query, searches Commons, and returns real photo URLs in order', async () => {
    createMock.mockResolvedValue(textResponse('parent teacher meeting classroom'))
    fetchWithTimeoutMock
      // search call
      .mockResolvedValueOnce(
        jsonResponse({
          query: {
            search: [
              { title: 'File:Parent teacher meeting.jpg' },
              { title: 'File:Some scanned book (IA book123).pdf' },
              { title: 'File:Classroom photo.png' },
            ],
          },
        }),
      )
      // imageinfo for the first photo title
      .mockResolvedValueOnce(
        jsonResponse({
          query: { pages: { '1': { imageinfo: [{ url: 'https://upload.wikimedia.org/a.jpg', mime: 'image/jpeg' }] } } },
        }),
      )
      // imageinfo for the second photo title
      .mockResolvedValueOnce(
        jsonResponse({
          query: { pages: { '2': { imageinfo: [{ url: 'https://upload.wikimedia.org/b.png', mime: 'image/png' }] } } },
        }),
      )
    const { searchWebImage } = await import('./web-image-search.js')

    const result = await searchWebImage('Grades K-2 Curriculum Night')

    expect(result).toEqual(['https://upload.wikimedia.org/a.jpg', 'https://upload.wikimedia.org/b.png'])
  })

  it('falls back to the raw title as the query when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({ query: { search: [] } }))
    const { searchWebImage } = await import('./web-image-search.js')

    await searchWebImage('Curriculum Night')

    const searchCallUrl = new URL(fetchWithTimeoutMock.mock.calls[0][0] as string)
    expect(searchCallUrl.searchParams.get('srsearch')).toBe('Curriculum Night')
  })

  it('returns an empty array when Commons search finds no results', async () => {
    createMock.mockResolvedValue(textResponse('classroom'))
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({ query: { search: [] } }))
    const { searchWebImage } = await import('./web-image-search.js')

    expect(await searchWebImage('Anything')).toEqual([])
  })

  it('excludes non-photo results (svg, pdf) from the candidate list', async () => {
    createMock.mockResolvedValue(textResponse('classroom'))
    fetchWithTimeoutMock.mockResolvedValueOnce(
      jsonResponse({
        query: {
          search: [{ title: 'File:Diagram.svg' }, { title: 'File:Book scan (IA x).pdf' }],
        },
      }),
    )
    const { searchWebImage } = await import('./web-image-search.js')

    expect(await searchWebImage('Anything')).toEqual([])
    // Only the initial search call — no imageinfo call for either non-photo result.
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array when the search request fails', async () => {
    createMock.mockResolvedValue(textResponse('classroom'))
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({}, false))
    const { searchWebImage } = await import('./web-image-search.js')

    expect(await searchWebImage('Anything')).toEqual([])
  })

  it('returns an empty array and does not throw on an unexpected error', async () => {
    createMock.mockResolvedValue(textResponse('classroom'))
    fetchWithTimeoutMock.mockRejectedValueOnce(new Error('boom'))
    const { searchWebImage } = await import('./web-image-search.js')

    expect(await searchWebImage('Anything')).toEqual([])
  })
})
