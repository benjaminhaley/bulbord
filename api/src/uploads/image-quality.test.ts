import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { isLowQualityImage } from './image-quality.js'

function pngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 100, g: 100, b: 100 } } }).png().toBuffer()
}

describe('isLowQualityImage', () => {
  it('accepts a normally-proportioned photo-sized image', async () => {
    const buffer = await pngBuffer(800, 600)
    expect(await isLowQualityImage(buffer)).toBe(false)
  })

  it('accepts a genuinely small but real image, like a Wikipedia fair-use poster', async () => {
    const buffer = await pngBuffer(220, 325)
    expect(await isLowQualityImage(buffer)).toBe(false)
  })

  it('rejects an image below the minimum dimension, like a site logo strip', async () => {
    const buffer = await pngBuffer(258, 21)
    expect(await isLowQualityImage(buffer)).toBe(true)
  })

  it('rejects an image with an extreme aspect ratio even if both dimensions clear the floor', async () => {
    const buffer = await pngBuffer(1200, 300)
    expect(await isLowQualityImage(buffer)).toBe(true)
  })

  it('rejects a corrupt/unreadable buffer', async () => {
    const buffer = Buffer.from('not an image')
    expect(await isLowQualityImage(buffer)).toBe(true)
  })
})
