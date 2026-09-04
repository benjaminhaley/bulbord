import { beforeEach, describe, expect, it, vi } from 'vitest'

const extractPageImageCandidatesMock = vi.fn()
const fetchExternalImageMock = vi.fn()
const isLowQualityImageMock = vi.fn()
const scoreImageRelevanceMock = vi.fn()
const uploadImageMock = vi.fn()
const searchWebImageMock = vi.fn()
const updateMock = vi.fn()
const setMock = vi.fn(() => ({ where: updateMock }))
// Consumed, in call order, by both isSharedListingPage's and
// isAlreadyClaimedImage's select().from().where().limit() queries — both
// have the same shape and are called sequentially within one
// enrichEventImage() run, so one shared queue mirrors that order. Defaults
// to "no sibling event found" when nothing (or nothing left) is queued, so
// tests that don't care about this path can ignore it entirely.
const dbQueryResults: Record<string, unknown>[][] = []

vi.mock('../uploads/extract-page-image.js', () => ({ extractPageImageCandidates: extractPageImageCandidatesMock }))
vi.mock('../uploads/fetch-external-image.js', () => ({ fetchExternalImage: fetchExternalImageMock }))
vi.mock('../uploads/image-quality.js', () => ({ isLowQualityImage: isLowQualityImageMock }))
vi.mock('../uploads/image-relevance.js', () => ({ scoreImageRelevance: scoreImageRelevanceMock }))
vi.mock('../uploads/storage.js', () => ({ imageUrl: (key: string) => `/uploads/${key}`, uploadImage: uploadImageMock }))
vi.mock('../uploads/web-image-search.js', () => ({ searchWebImage: searchWebImageMock }))
vi.mock('../db/client.js', () => ({
  db: {
    update: () => ({ set: setMock }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(dbQueryResults.shift() ?? []) }),
      }),
    }),
  },
}))

describe('enrichEventImage', () => {
  beforeEach(() => {
    extractPageImageCandidatesMock.mockReset().mockResolvedValue([])
    fetchExternalImageMock.mockReset()
    isLowQualityImageMock.mockReset()
    scoreImageRelevanceMock.mockReset().mockResolvedValue({ keep: true, reason: null })
    uploadImageMock.mockReset().mockResolvedValue({ key: 'events/final.jpg', thumbnailKey: 'events/final-thumb.jpg' })
    searchWebImageMock.mockReset().mockResolvedValue([])
    setMock.mockClear()
    updateMock.mockReset()
    dbQueryResults.length = 0
  })

  it('skips a low-quality candidate and sources from the next one down the list', async () => {
    extractPageImageCandidatesMock.mockResolvedValue([
      { url: 'https://example.com/logo.png', isLogo: true },
      { url: 'https://example.com/real-photo.jpg', isLogo: false },
    ])
    fetchExternalImageMock
      .mockResolvedValueOnce(Buffer.from('logo-bytes'))
      .mockResolvedValueOnce(Buffer.from('real-photo-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', { sourceUrl: 'https://example.com/page', overrideImageUrl: null })

    expect(result.result).toBe('sourced')
    expect(fetchExternalImageMock).toHaveBeenNthCalledWith(1, 'https://example.com/logo.png')
    expect(fetchExternalImageMock).toHaveBeenNthCalledWith(2, 'https://example.com/real-photo.jpg')
    expect(isLowQualityImageMock).toHaveBeenNthCalledWith(1, Buffer.from('logo-bytes'), { isLogo: true })
    expect(isLowQualityImageMock).toHaveBeenNthCalledWith(2, Buffer.from('real-photo-bytes'), { isLogo: false })
    expect(uploadImageMock).toHaveBeenCalledWith(Buffer.from('real-photo-bytes'), 'events')
  })

  it('tries overrideImageUrl before any page-extracted candidate', async () => {
    extractPageImageCandidatesMock.mockResolvedValue([{ url: 'https://example.com/page-image.jpg', isLogo: false }])
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('poster-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(false)
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', {
      sourceUrl: 'https://example.com/page',
      overrideImageUrl: 'https://wikipedia.org/poster.jpg',
    })

    expect(result.result).toBe('sourced')
    expect(fetchExternalImageMock).toHaveBeenCalledTimes(1)
    expect(fetchExternalImageMock).toHaveBeenCalledWith('https://wikipedia.org/poster.jpg')
  })

  it('returns none when every candidate is low quality or fails to download', async () => {
    extractPageImageCandidatesMock.mockResolvedValue([
      { url: 'https://example.com/logo.png', isLogo: true },
      { url: 'https://example.com/broken.jpg', isLogo: false },
    ])
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('logo-bytes')).mockResolvedValueOnce(null)
    isLowQualityImageMock.mockResolvedValueOnce(true)
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', { sourceUrl: 'https://example.com/page', overrideImageUrl: null })

    expect(result.result).toBe('none')
    expect(uploadImageMock).not.toHaveBeenCalled()
  })

  it('returns none immediately when there is no sourceUrl or overrideImageUrl', async () => {
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', { sourceUrl: null, overrideImageUrl: null })

    expect(result.result).toBe('none')
    expect(extractPageImageCandidatesMock).not.toHaveBeenCalled()
    expect(searchWebImageMock).not.toHaveBeenCalled()
  })

  it('falls back to a web image search when no page candidate passes, given a title', async () => {
    extractPageImageCandidatesMock.mockResolvedValue([{ url: 'https://example.com/bad.jpg', isLogo: false }])
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('bad-bytes')).mockResolvedValueOnce(Buffer.from('found-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    searchWebImageMock.mockResolvedValue(['https://upload.wikimedia.org/found.jpg'])
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', {
      sourceUrl: 'https://example.com/page',
      overrideImageUrl: null,
      title: 'Grades K-2 Curriculum Night',
      description: 'A curriculum night for K-2 families.',
    })

    expect(result.result).toBe('sourced')
    expect(searchWebImageMock).toHaveBeenCalledWith('Grades K-2 Curriculum Night', 'A curriculum night for K-2 families.')
    expect(fetchExternalImageMock).toHaveBeenLastCalledWith('https://upload.wikimedia.org/found.jpg')
    expect(uploadImageMock).toHaveBeenCalledWith(Buffer.from('found-bytes'), 'events')
  })

  it('skips page-extracted candidates entirely when source_url is shared by a differently-titled event', async () => {
    // Real 2026-09-04 incident: 8 different events sourced from the same
    // generic listing page all got that page's own (inappropriate) og:image.
    dbQueryResults.push([{ id: 'other-event' }]) // isSharedListingPage: shared
    extractPageImageCandidatesMock.mockResolvedValue([{ url: 'https://example.com/shared-page-image.jpg', isLogo: false }])
    searchWebImageMock.mockResolvedValue(['https://upload.wikimedia.org/found.jpg'])
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('found-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(false)
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', {
      sourceUrl: 'https://example.com/listing-page',
      overrideImageUrl: null,
      title: 'A Craft Series September: Jeanius',
    })

    expect(result.result).toBe('sourced')
    expect(extractPageImageCandidatesMock).not.toHaveBeenCalled()
    expect(fetchExternalImageMock).toHaveBeenCalledTimes(1)
    expect(fetchExternalImageMock).toHaveBeenCalledWith('https://upload.wikimedia.org/found.jpg')
  })

  it('does NOT treat source_url as a shared listing page when the only other row sharing it has the same title', async () => {
    // A genuine recurring series (the same real market page re-scraped
    // weekly) shares one source_url across many same-titled occurrences on
    // purpose — each one must still be allowed to re-extract that page's
    // own real photo, not get rerouted into a worse web-search fallback.
    dbQueryResults.push([]) // isSharedListingPage: no *differently-titled* row shares this URL
    extractPageImageCandidatesMock.mockResolvedValue([{ url: 'https://example.com/market-photo.jpg', isLogo: false }])
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('market-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(false)
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-2', {
      sourceUrl: 'https://example.com/weekly-market',
      overrideImageUrl: null,
      title: 'Nettelhorst French Market',
    })

    expect(result.result).toBe('sourced')
    expect(extractPageImageCandidatesMock).toHaveBeenCalledWith('https://example.com/weekly-market')
    expect(fetchExternalImageMock).toHaveBeenCalledWith('https://example.com/market-photo.jpg')
  })

  it('still tries overrideImageUrl even when source_url is shared by a differently-titled event', async () => {
    dbQueryResults.push([{ id: 'other-event' }]) // isSharedListingPage: shared
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('poster-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(false)
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', {
      sourceUrl: 'https://example.com/listing-page',
      overrideImageUrl: 'https://wikipedia.org/poster.jpg',
      title: 'Some Event',
    })

    expect(result.result).toBe('sourced')
    expect(extractPageImageCandidatesMock).not.toHaveBeenCalled()
    expect(fetchExternalImageMock).toHaveBeenCalledWith('https://wikipedia.org/poster.jpg')
  })

  it('skips a page-extracted candidate already claimed as another differently-titled event\'s image, even from a different source_url', async () => {
    // Real 2026-09-04 incident: two different BiblioCommons event pages,
    // each with its own distinct source_url, both fell back to the exact
    // same site logo image — isSharedListingPage can't catch this (the
    // pages genuinely differ), so isAlreadyClaimedImage checks the
    // *resolved* image URL directly instead.
    dbQueryResults.push([]) // isSharedListingPage: no other row shares this URL
    dbQueryResults.push([{ id: 'other-event' }]) // isAlreadyClaimedImage: already claimed
    extractPageImageCandidatesMock.mockResolvedValue([{ url: 'https://example.com/cpl-logo.png', isLogo: true }])
    searchWebImageMock.mockResolvedValue(['https://upload.wikimedia.org/found.jpg'])
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('found-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(false)
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', {
      sourceUrl: 'https://example.com/events/this-events-own-page',
      overrideImageUrl: null,
      title: 'Craft Supply Swap',
    })

    expect(result.result).toBe('sourced')
    // The claimed candidate was never even downloaded — skipped by URL alone.
    expect(fetchExternalImageMock).not.toHaveBeenCalledWith('https://example.com/cpl-logo.png')
    expect(fetchExternalImageMock).toHaveBeenCalledWith('https://upload.wikimedia.org/found.jpg')
  })

  it('records the winning external URL as sourceImageUrl for future duplicate checks', async () => {
    extractPageImageCandidatesMock.mockResolvedValue([{ url: 'https://example.com/real-photo.jpg', isLogo: false }])
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('real-photo-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(false)
    const { enrichEventImage } = await import('./image-enrichment.js')

    await enrichEventImage('event-1', { sourceUrl: 'https://example.com/page', overrideImageUrl: null, title: 'Some Event' })

    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ sourceImageUrl: 'https://example.com/real-photo.jpg' }))
  })

  it('skips a page-extracted candidate that fails the content-relevance score, and falls back to web search', async () => {
    // Feedback #158: a real, well-formed, correctly-sized photo of the
    // wrong thing (a hosting org's own generic branding photo) used to
    // sail straight through the old dimension/aspect-ratio-only gate.
    extractPageImageCandidatesMock.mockResolvedValue([{ url: 'https://example.com/generic-branding.jpg', isLogo: false }])
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('branding-bytes')).mockResolvedValueOnce(Buffer.from('found-bytes'))
    isLowQualityImageMock.mockResolvedValue(false)
    scoreImageRelevanceMock.mockResolvedValueOnce({ keep: false, reason: 'generic branding photo' }).mockResolvedValueOnce({ keep: true, reason: 'matches' })
    searchWebImageMock.mockResolvedValue(['https://upload.wikimedia.org/found.jpg'])
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', {
      sourceUrl: 'https://example.com/page',
      overrideImageUrl: null,
      title: 'Virtual Leadership Training Info Session',
      description: 'Online info session about a sustainability leadership program.',
    })

    expect(result.result).toBe('sourced')
    expect(scoreImageRelevanceMock).toHaveBeenNthCalledWith(1, Buffer.from('branding-bytes'), {
      title: 'Virtual Leadership Training Info Session',
      description: 'Online info session about a sustainability leadership program.',
    })
    expect(uploadImageMock).toHaveBeenCalledWith(Buffer.from('found-bytes'), 'events')
  })

  it('does not content-score a site-logo fallback candidate', async () => {
    extractPageImageCandidatesMock.mockResolvedValue([{ url: 'https://example.com/logo.png', isLogo: true }])
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('logo-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(false)
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', {
      sourceUrl: 'https://example.com/page',
      overrideImageUrl: null,
      title: 'Some Event',
    })

    expect(result.result).toBe('sourced')
    expect(scoreImageRelevanceMock).not.toHaveBeenCalled()
  })

  it('never calls the web image search fallback when no title is given', async () => {
    extractPageImageCandidatesMock.mockResolvedValue([])
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', { sourceUrl: 'https://example.com/page', overrideImageUrl: null })

    expect(result.result).toBe('none')
    expect(searchWebImageMock).not.toHaveBeenCalled()
  })
})
