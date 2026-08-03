import { beforeEach, describe, expect, it, vi } from 'vitest'

const extractPageImageCandidatesMock = vi.fn()
const fetchExternalImageMock = vi.fn()
const isLowQualityImageMock = vi.fn()
const uploadImageMock = vi.fn()
const updateMock = vi.fn()
const setMock = vi.fn(() => ({ where: updateMock }))

vi.mock('../uploads/extract-page-image.js', () => ({ extractPageImageCandidates: extractPageImageCandidatesMock }))
vi.mock('../uploads/fetch-external-image.js', () => ({ fetchExternalImage: fetchExternalImageMock }))
vi.mock('../uploads/image-quality.js', () => ({ isLowQualityImage: isLowQualityImageMock }))
vi.mock('../uploads/storage.js', () => ({ imageUrl: (key: string) => `/uploads/${key}`, uploadImage: uploadImageMock }))
vi.mock('../db/client.js', () => ({ db: { update: () => ({ set: setMock }) } }))

describe('enrichEventImage', () => {
  beforeEach(() => {
    extractPageImageCandidatesMock.mockReset()
    fetchExternalImageMock.mockReset()
    isLowQualityImageMock.mockReset()
    uploadImageMock.mockReset().mockResolvedValue({ key: 'events/final.jpg', thumbnailKey: 'events/final-thumb.jpg' })
    setMock.mockClear()
    updateMock.mockReset()
  })

  it('skips a low-quality candidate and sources from the next one down the list', async () => {
    extractPageImageCandidatesMock.mockResolvedValue(['https://example.com/logo.png', 'https://example.com/real-photo.jpg'])
    fetchExternalImageMock
      .mockResolvedValueOnce(Buffer.from('logo-bytes'))
      .mockResolvedValueOnce(Buffer.from('real-photo-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const { enrichEventImage } = await import('./image-enrichment.js')

    const result = await enrichEventImage('event-1', { sourceUrl: 'https://example.com/page', overrideImageUrl: null })

    expect(result).toBe('sourced')
    expect(fetchExternalImageMock).toHaveBeenNthCalledWith(1, 'https://example.com/logo.png')
    expect(fetchExternalImageMock).toHaveBeenNthCalledWith(2, 'https://example.com/real-photo.jpg')
    expect(uploadImageMock).toHaveBeenCalledWith(Buffer.from('real-photo-bytes'), 'events')
  })

  it('tries overrideImageUrl before any page-extracted candidate', async () => {
    extractPageImageCandidatesMock.mockResolvedValue(['https://example.com/page-image.jpg'])
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
    extractPageImageCandidatesMock.mockResolvedValue(['https://example.com/logo.png', 'https://example.com/broken.jpg'])
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
  })
})
