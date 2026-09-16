import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchWithTimeoutMock = vi.fn()
const createMock = vi.fn()

vi.mock('../uploads/fetch-with-timeout.js', () => ({ fetchWithTimeout: fetchWithTimeoutMock }))
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: createMock }
  }
  return { default: MockAnthropic }
})

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body }
}

function textResponse(text: string, stopReason = 'end_turn') {
  return { stop_reason: stopReason, content: [{ type: 'text', text }] }
}

describe('lookupMoviePoster', () => {
  beforeEach(() => {
    fetchWithTimeoutMock.mockReset()
  })

  it('returns the thumbnail source from a successful search + page-summary lookup', async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: 'Happy Gilmore' }] } }))
      .mockResolvedValueOnce(jsonResponse({ thumbnail: { source: 'https://upload.wikimedia.org/happygilmoreposter.jpg' } }))
    const { lookupMoviePoster } = await import('./movie-poster-lookup.js')

    const result = await lookupMoviePoster('Happy Gilmore')

    expect(result).toBe('https://upload.wikimedia.org/happygilmoreposter.jpg')
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(2)
    expect(fetchWithTimeoutMock.mock.calls[1][0]).toBe('https://en.wikipedia.org/api/rest_v1/page/summary/Happy_Gilmore')
  })

  it('returns null when the search finds no page', async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({ query: { search: [] } }))
    const { lookupMoviePoster } = await import('./movie-poster-lookup.js')

    const result = await lookupMoviePoster('Some Obscure Nonexistent Film')

    expect(result).toBeNull()
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1)
  })

  it('returns null when the found page has no thumbnail', async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: 'Some Page' }] } }))
      .mockResolvedValueOnce(jsonResponse({}))
    const { lookupMoviePoster } = await import('./movie-poster-lookup.js')

    const result = await lookupMoviePoster('Some Page')

    expect(result).toBeNull()
  })

  it('returns null when the search request fails', async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({}, false))
    const { lookupMoviePoster } = await import('./movie-poster-lookup.js')

    const result = await lookupMoviePoster('Anything')

    expect(result).toBeNull()
  })

  it('returns null when fetchWithTimeout returns null (network failure)', async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(null)
    const { lookupMoviePoster } = await import('./movie-poster-lookup.js')

    const result = await lookupMoviePoster('Anything')

    expect(result).toBeNull()
  })

  it('returns null and does not throw on an unexpected error', async () => {
    fetchWithTimeoutMock.mockRejectedValueOnce(new Error('boom'))
    const { lookupMoviePoster } = await import('./movie-poster-lookup.js')

    const result = await lookupMoviePoster('Anything')

    expect(result).toBeNull()
  })
})

describe('identifyFilmScreening', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    vi.resetModules()
  })

  it('returns the canonical film title when the model identifies a real film screening', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ isFilmScreening: true, filmTitle: 'Clifford the Big Red Dog' })))
    const { identifyFilmScreening } = await import('./movie-poster-lookup.js')

    const result = await identifyFilmScreening('Film Screening: Clifford the Big Red Dog', 'A screening at the library.')

    expect(result).toBe('Clifford the Big Red Dog')
  })

  it('returns null when the model says this is not a specific film screening', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ isFilmScreening: false, filmTitle: null })))
    const { identifyFilmScreening } = await import('./movie-poster-lookup.js')

    expect(await identifyFilmScreening('Family Movie Night')).toBeNull()
  })

  it('returns null when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { identifyFilmScreening } = await import('./movie-poster-lookup.js')

    expect(await identifyFilmScreening('Film Screening: Clifford the Big Red Dog')).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns null on a refusal or truncated response', async () => {
    createMock.mockResolvedValue(textResponse('', 'refusal'))
    const { identifyFilmScreening } = await import('./movie-poster-lookup.js')

    expect(await identifyFilmScreening('Anything')).toBeNull()
  })

  it('returns null and does not throw on an unexpected error', async () => {
    createMock.mockRejectedValue(new Error('boom'))
    const { identifyFilmScreening } = await import('./movie-poster-lookup.js')

    expect(await identifyFilmScreening('Anything')).toBeNull()
  })

  it('returns null on malformed JSON', async () => {
    createMock.mockResolvedValue(textResponse('not json'))
    const { identifyFilmScreening } = await import('./movie-poster-lookup.js')

    expect(await identifyFilmScreening('Anything')).toBeNull()
  })
})
