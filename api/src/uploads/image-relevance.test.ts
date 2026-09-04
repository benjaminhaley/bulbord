import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: createMock }
  }
  return { default: MockAnthropic }
})

function textResponse(text: string, stopReason = 'end_turn') {
  return { stop_reason: stopReason, content: [{ type: 'text', text }] }
}

// A minimal real JPEG header (SOI marker) — enough for guessMediaType() to
// recognize it as image/jpeg without needing a full valid image file.
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])

describe('scoreImageRelevance', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    vi.resetModules()
  })

  it('keeps an image the model scores as a real match', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ keep: true, reason: 'matches' })))
    const { scoreImageRelevance } = await import('./image-relevance.js')

    const result = await scoreImageRelevance(JPEG_BUFFER, { title: 'Fall Festival', description: 'A festival.' })

    expect(result).toEqual({ keep: true, reason: 'matches' })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: JPEG_BUFFER.toString('base64') } },
              { type: 'text', text: JSON.stringify({ title: 'Fall Festival', description: 'A festival.' }) },
            ],
          }),
        ],
      }),
    )
  })

  it('rejects an image the model scores as a generic/mismatched photo', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ keep: false, reason: 'generic branding photo' })))
    const { scoreImageRelevance } = await import('./image-relevance.js')

    const result = await scoreImageRelevance(JPEG_BUFFER, { title: 'Virtual Info Session' })

    expect(result).toEqual({ keep: false, reason: 'generic branding photo' })
  })

  it('fails open when there is no API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { scoreImageRelevance } = await import('./image-relevance.js')

    const result = await scoreImageRelevance(JPEG_BUFFER, { title: 'Some Event' })

    expect(result).toEqual({ keep: true, reason: null })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('fails open on an unrecognized image format', async () => {
    const { scoreImageRelevance } = await import('./image-relevance.js')

    const result = await scoreImageRelevance(Buffer.from('not an image'), { title: 'Some Event' })

    expect(result).toEqual({ keep: true, reason: null })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('fails open on malformed model output', async () => {
    createMock.mockResolvedValue(textResponse('not json'))
    const { scoreImageRelevance } = await import('./image-relevance.js')

    const result = await scoreImageRelevance(JPEG_BUFFER, { title: 'Some Event' })

    expect(result).toEqual({ keep: true, reason: null })
  })

  it('fails open on a refusal stop_reason', async () => {
    createMock.mockResolvedValue(textResponse('', 'refusal'))
    const { scoreImageRelevance } = await import('./image-relevance.js')

    const result = await scoreImageRelevance(JPEG_BUFFER, { title: 'Some Event' })

    expect(result).toEqual({ keep: true, reason: null })
  })
})
