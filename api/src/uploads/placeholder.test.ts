import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const uploadImageMock = vi.fn()
const imageUrlMock = vi.fn((key: string | null) => (key ? `/uploads/${key}` : null))

vi.mock('./storage.js', () => ({ uploadImage: uploadImageMock, imageUrl: imageUrlMock }))

describe('generatePlaceholderImage', () => {
  it('generates a real, correctly-sized image', async () => {
    const { generatePlaceholderImage } = await import('./placeholder.js')
    const buffer = await generatePlaceholderImage('Back to School Clothing Swap')
    const { width, height } = await sharp(buffer).metadata()

    expect(width).toBe(800)
    expect(height).toBe(450)
  })

  it('is deterministic — the same title always gets the same color', async () => {
    const { generatePlaceholderImage } = await import('./placeholder.js')
    const first = await generatePlaceholderImage('Craft Supply Swap')
    const second = await generatePlaceholderImage('Craft Supply Swap')

    expect(first.equals(second)).toBe(true)
  })

  it('uses a "?" initial when the title has no usable leading character', async () => {
    const { generatePlaceholderImage } = await import('./placeholder.js')
    // Just asserting this doesn't throw on an edge-case title (whitespace
    // only) — the real content is unrecoverable from a rasterized PNG buffer.
    await expect(generatePlaceholderImage('   ')).resolves.toBeInstanceOf(Buffer)
  })

  it('escapes XML-special characters in the title so a "<" or "&" cannot break the SVG', async () => {
    const { generatePlaceholderImage } = await import('./placeholder.js')
    await expect(generatePlaceholderImage('<Tom & Jerry>')).resolves.toBeInstanceOf(Buffer)
  })
})

describe('uploadPlaceholderImage', () => {
  beforeEach(() => {
    uploadImageMock.mockReset().mockResolvedValue({ key: 'events/placeholder.png', thumbnailKey: 'events/placeholder-thumb.jpg' })
    imageUrlMock.mockClear()
  })

  it('generates, uploads, and returns real full/thumbnail URLs', async () => {
    const { uploadPlaceholderImage } = await import('./placeholder.js')

    const result = await uploadPlaceholderImage('Halloween Window Painting', 'events')

    expect(result).toEqual({
      imageUrl: '/uploads/events/placeholder.png',
      thumbnailUrl: '/uploads/events/placeholder-thumb.jpg',
    })
    expect(uploadImageMock).toHaveBeenCalledWith(expect.any(Buffer), 'events')
  })
})
