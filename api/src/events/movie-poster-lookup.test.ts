import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchWithTimeoutMock = vi.fn()

vi.mock('../uploads/fetch-with-timeout.js', () => ({ fetchWithTimeout: fetchWithTimeoutMock }))

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body }
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
