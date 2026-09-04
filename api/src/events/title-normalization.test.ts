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

describe('simplifyTitle', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    vi.resetModules()
  })

  it('returns the simplified title from a successful call', async () => {
    createMock.mockResolvedValue(textResponse('Movie Night: Happy Gilmore'))
    const { simplifyTitle } = await import('./title-normalization.js')

    const result = await simplifyTitle({
      title: 'Toyota Movie Nights at Gallagher Way: Happy Gilmore',
      locationName: 'Gallagher Way',
    })

    expect(result).toBe('Movie Night: Happy Gilmore')
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-5',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: JSON.stringify({
              title: 'Toyota Movie Nights at Gallagher Way: Happy Gilmore',
              description: null,
              location_name: 'Gallagher Way',
            }),
          }),
        ],
      }),
    )
  })

  it('falls back to the original title when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { simplifyTitle } = await import('./title-normalization.js')

    const result = await simplifyTitle({ title: 'Baby Time' })

    expect(result).toBe('Baby Time')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('falls back to the original title when the API call throws', async () => {
    createMock.mockRejectedValue(new Error('network error'))
    const { simplifyTitle } = await import('./title-normalization.js')

    const result = await simplifyTitle({ title: 'Baby Time' })

    expect(result).toBe('Baby Time')
  })

  it('falls back to the original title when the model refuses', async () => {
    createMock.mockResolvedValue(textResponse('', 'refusal'))
    const { simplifyTitle } = await import('./title-normalization.js')

    const result = await simplifyTitle({ title: 'Baby Time' })

    expect(result).toBe('Baby Time')
  })

  it('falls back to the original title when the response text is empty', async () => {
    createMock.mockResolvedValue(textResponse('   '))
    const { simplifyTitle } = await import('./title-normalization.js')

    const result = await simplifyTitle({ title: 'Baby Time' })

    expect(result).toBe('Baby Time')
  })

  // Real incident (2026-09-03): a max_tokens-truncated response used to be
  // trusted as-is, producing garbled fragment titles ("N", "No", "Nettel")
  // that then landed as real events — a truncated response is never a safe
  // title, regardless of how much (non-empty) text came back before the
  // cutoff.
  it('falls back to the original title when the response is truncated by max_tokens', async () => {
    createMock.mockResolvedValue(textResponse('N', 'max_tokens'))
    const { simplifyTitle } = await import('./title-normalization.js')

    const result = await simplifyTitle({ title: 'Chicago Nettelhorst French Market' })

    expect(result).toBe('Chicago Nettelhorst French Market')
  })
})
