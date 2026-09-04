import { beforeEach, describe, expect, it, vi } from 'vitest'

const extractPageImageCandidatesMock = vi.fn()
const fetchExternalImageMock = vi.fn()
const isLowQualityImageMock = vi.fn()
const uploadImageMock = vi.fn()
const searchWebImageMock = vi.fn()
const updateMock = vi.fn()
const setMock = vi.fn(() => ({ where: updateMock }))
// Consumed by isSharedListingPage's select().from().where().limit() query —
// defaults to "no sibling event found" (not a shared listing page) when
// nothing is queued, so existing tests that never touch this stay unchanged.
const sharedListingResults: Record<string, unknown>[][] = []

vi.mock('../uploads/extract-page-image.js', () => ({ extractPageImageCandidates: extractPageImageCandidatesMock }))
vi.mock('../uploads/fetch-external-image.js', () => ({ fetchExternalImage: fetchExternalImageMock }))
vi.mock('../uploads/image-quality.js', () => ({ isLowQualityImage: isLowQualityImageMock }))
vi.mock('../uploads/storage.js', () => ({ imageUrl: (key: string) => `/uploads/${key}`, uploadImage: uploadImageMock }))
vi.mock('../uploads/web-image-search.js', () => ({ searchWebImage: searchWebImageMock }))
vi.mock('../db/client.js', () => ({
  db: {
    update: () => ({ set: setMock }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(sharedListingResults.shift() ?? []) }),
      }),
    }),
  },
}))

describe('enrichEventImage', () => {
  beforeEach(() => {
    extractPageImageCandidatesMock.mockReset().mockResolvedValue([])
    fetchExternalImageMock.mockReset()
    isLowQualityImageMock.mockReset()
    uploadImageMock.mockReset().mockResolvedValue({ key: 'events/final.jpg', thumbnailKey: 'events/final-thumb.jpg' })
    searchWebImageMock.mockReset().mockResolvedValue([])
    setMock.mockClear()
    updateMock.mockReset()
    sharedListingResults.length = 0
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

    expect(result).toBe('sourced')
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

    expect(result).toBe('sourced')
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

    expect(result).toBe('none')
    expect(uploadImageMock).not.toHaveBeenCalled()
  })

  it('returns none immediately when there is no sourceUrl or overrideImageUrl', async () => {
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', { sourceUrl: null, overrideImageUrl: null })

    expect(result).toBe('none')
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

    expect(result).toBe('sourced')
    expect(searchWebImageMock).toHaveBeenCalledWith('Grades K-2 Curriculum Night', 'A curriculum night for K-2 families.')
    expect(fetchExternalImageMock).toHaveBeenLastCalledWith('https://upload.wikimedia.org/found.jpg')
    expect(uploadImageMock).toHaveBeenCalledWith(Buffer.from('found-bytes'), 'events')
  })

  it('skips page-extracted candidates entirely when source_url is a shared listing page another event already points at', async () => {
    // Real 2026-09-04 incident: 8 different events sourced from the same
    // generic listing page all got that page's own (inappropriate) og:image.
    sharedListingResults.push([{ id: 'other-event' }])
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

    expect(result).toBe('sourced')
    expect(extractPageImageCandidatesMock).not.toHaveBeenCalled()
    expect(fetchExternalImageMock).toHaveBeenCalledTimes(1)
    expect(fetchExternalImageMock).toHaveBeenCalledWith('https://upload.wikimedia.org/found.jpg')
  })

  it('still tries overrideImageUrl even when source_url is a shared listing page', async () => {
    sharedListingResults.push([{ id: 'other-event' }])
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('poster-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(false)
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', {
      sourceUrl: 'https://example.com/listing-page',
      overrideImageUrl: 'https://wikipedia.org/poster.jpg',
    })

    expect(result).toBe('sourced')
    expect(extractPageImageCandidatesMock).not.toHaveBeenCalled()
    expect(fetchExternalImageMock).toHaveBeenCalledWith('https://wikipedia.org/poster.jpg')
  })

  it('never calls the web image search fallback when no title is given', async () => {
    extractPageImageCandidatesMock.mockResolvedValue([])
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', { sourceUrl: 'https://example.com/page', overrideImageUrl: null })

    expect(result).toBe('none')
    expect(searchWebImageMock).not.toHaveBeenCalled()
  })
})
