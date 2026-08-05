import { beforeEach, describe, expect, it, vi } from 'vitest'

const extractPageImageCandidatesMock = vi.fn()
const fetchExternalImageMock = vi.fn()
const isLowQualityImageMock = vi.fn()
const uploadImageMock = vi.fn()

vi.mock('../uploads/extract-page-image.js', () => ({ extractPageImageCandidates: extractPageImageCandidatesMock }))
vi.mock('../uploads/fetch-external-image.js', () => ({ fetchExternalImage: fetchExternalImageMock }))
vi.mock('../uploads/image-quality.js', () => ({ isLowQualityImage: isLowQualityImageMock }))
vi.mock('../uploads/storage.js', () => ({ imageUrl: (key: string) => `/uploads/${key}`, uploadImage: uploadImageMock }))

describe('enrichCampSourceImage', () => {
  beforeEach(() => {
    extractPageImageCandidatesMock.mockReset()
    fetchExternalImageMock.mockReset()
    isLowQualityImageMock.mockReset()
    uploadImageMock.mockReset().mockResolvedValue({ key: 'camps/final.jpg', thumbnailKey: 'camps/final-thumb.jpg' })
  })

  it('skips a low-quality candidate and sources from the next one down the list', async () => {
    extractPageImageCandidatesMock.mockResolvedValue(['https://example.com/logo.png', 'https://example.com/real-photo.jpg'])
    fetchExternalImageMock
      .mockResolvedValueOnce(Buffer.from('logo-bytes'))
      .mockResolvedValueOnce(Buffer.from('real-photo-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const { enrichCampSourceImage } = await import('./image-enrichment.js')

    const result = await enrichCampSourceImage(['https://example.com/page'])

    expect(result).toEqual({ imageUrl: '/uploads/camps/final.jpg', thumbnailUrl: '/uploads/camps/final-thumb.jpg' })
    expect(fetchExternalImageMock).toHaveBeenNthCalledWith(1, 'https://example.com/logo.png')
    expect(fetchExternalImageMock).toHaveBeenNthCalledWith(2, 'https://example.com/real-photo.jpg')
    expect(uploadImageMock).toHaveBeenCalledWith(Buffer.from('real-photo-bytes'), 'camps')
  })

  it('returns null when a download fails but keeps trying the rest of the list', async () => {
    extractPageImageCandidatesMock.mockResolvedValue(['https://example.com/broken.jpg', 'https://example.com/ok.jpg'])
    fetchExternalImageMock.mockResolvedValueOnce(null).mockResolvedValueOnce(Buffer.from('ok-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(false)
    const { enrichCampSourceImage } = await import('./image-enrichment.js')

    const result = await enrichCampSourceImage(['https://example.com/page'])

    expect(result).not.toBeNull()
    expect(uploadImageMock).toHaveBeenCalledWith(Buffer.from('ok-bytes'), 'camps')
  })

  it('returns null when nothing in the whole candidate list passes', async () => {
    extractPageImageCandidatesMock.mockResolvedValue(['https://example.com/logo.png'])
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('logo-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(true)
    const { enrichCampSourceImage } = await import('./image-enrichment.js')

    const result = await enrichCampSourceImage(['https://example.com/page'])

    expect(result).toBeNull()
    expect(uploadImageMock).not.toHaveBeenCalled()
  })

  it('returns null when the page has no candidates at all', async () => {
    extractPageImageCandidatesMock.mockResolvedValue([])
    const { enrichCampSourceImage } = await import('./image-enrichment.js')

    const result = await enrichCampSourceImage(['https://example.com/page'])

    expect(result).toBeNull()
  })

  it('falls through to a second source page when the first has no usable candidates', async () => {
    extractPageImageCandidatesMock.mockImplementation(async (url: string) =>
      url === 'https://example.com/facebook' ? [] : ['https://example.com/about-real-photo.jpg'],
    )
    fetchExternalImageMock.mockResolvedValueOnce(Buffer.from('real-photo-bytes'))
    isLowQualityImageMock.mockResolvedValueOnce(false)
    const { enrichCampSourceImage } = await import('./image-enrichment.js')

    const result = await enrichCampSourceImage(['https://example.com/facebook', 'https://example.com/about'])

    expect(result).toEqual({ imageUrl: '/uploads/camps/final.jpg', thumbnailUrl: '/uploads/camps/final-thumb.jpg' })
    expect(extractPageImageCandidatesMock).toHaveBeenCalledWith('https://example.com/facebook')
    expect(extractPageImageCandidatesMock).toHaveBeenCalledWith('https://example.com/about')
  })
})
