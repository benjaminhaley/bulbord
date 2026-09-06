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

describe('checkDateQuality', () => {
  it('passes a real, plausible upcoming date', async () => {
    const { checkDateQuality } = await import('./candidate-checks.js')
    expect(checkDateQuality('2026-11-22', '2026-09-06').pass).toBe(true)
  })

  it('fails a date in the past', async () => {
    const { checkDateQuality } = await import('./candidate-checks.js')
    const result = checkDateQuality('2026-01-01', '2026-09-06')
    expect(result).toEqual(expect.objectContaining({ pass: false, reason: expect.stringContaining('past') }))
  })

  it('fails a date implausibly far in the future', async () => {
    const { checkDateQuality } = await import('./candidate-checks.js')
    const result = checkDateQuality('2099-01-01', '2026-09-06')
    expect(result.pass).toBe(false)
  })

  it('fails a malformed date string', async () => {
    const { checkDateQuality } = await import('./candidate-checks.js')
    const result = checkDateQuality('not-a-date', '2026-09-06')
    expect(result).toEqual(expect.objectContaining({ pass: false, reason: expect.stringContaining('not a valid date') }))
  })
})

describe('checkTimeQuality', () => {
  it('passes all-day with no start time', async () => {
    const { checkTimeQuality } = await import('./candidate-checks.js')
    expect(checkTimeQuality(undefined, true).pass).toBe(true)
  })

  it('passes a specific start time with all_day false', async () => {
    const { checkTimeQuality } = await import('./candidate-checks.js')
    expect(checkTimeQuality('18:00', false).pass).toBe(true)
  })

  it('fails all_day true with a start time also set', async () => {
    const { checkTimeQuality } = await import('./candidate-checks.js')
    expect(checkTimeQuality('18:00', true).pass).toBe(false)
  })

  it('fails all_day false with no start time', async () => {
    const { checkTimeQuality } = await import('./candidate-checks.js')
    expect(checkTimeQuality(undefined, false).pass).toBe(false)
  })
})

describe('buildDuplicateCheck', () => {
  it('always passes — a real duplicate never reaches this point', async () => {
    const { buildDuplicateCheck } = await import('./candidate-checks.js')
    expect(buildDuplicateCheck().pass).toBe(true)
  })
})

describe('runTextChecksWithRetry', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    vi.resetModules()
  })

  it('returns [] for an empty input with no API call', async () => {
    const { runTextChecksWithRetry } = await import('./candidate-checks.js')
    const result = await runTextChecksWithRetry([])
    expect(result).toEqual([])
    expect(createMock).not.toHaveBeenCalled()
  })

  it('does not retry a candidate whose initial pass already passes every check', async () => {
    createMock.mockResolvedValueOnce(
      textResponse(
        JSON.stringify([
          {
            titleQuality: { pass: true, reason: 'clear' },
            descriptionQuality: { pass: true, reason: 'informative' },
            locationLabelQuality: { pass: true, reason: 'named venue' },
            addressQuality: { pass: true, reason: 'real address' },
          },
        ]),
      ),
    )
    const { runTextChecksWithRetry } = await import('./candidate-checks.js')

    const [result] = await runTextChecksWithRetry([{ title: 'Fall Festival', address: '3252 N Broadway' }])

    expect(result.checks.titleQuality).toEqual({ pass: true, reason: 'clear', attempts: 1 })
    expect(result.correctedFields).toEqual({})
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('retries exactly once for a failing candidate, applying any corrected field the retry finds', async () => {
    createMock
      .mockResolvedValueOnce(
        textResponse(
          JSON.stringify([
            {
              titleQuality: { pass: true, reason: 'clear' },
              descriptionQuality: { pass: true, reason: 'informative' },
              locationLabelQuality: { pass: true, reason: 'named venue' },
              addressQuality: { pass: false, reason: 'too vague' },
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        textResponse(
          JSON.stringify({
            addressQuality: { pass: true, reason: 'found the real address in the source text', correctedAddress: '3252 N Broadway' },
          }),
        ),
      )
    const { runTextChecksWithRetry } = await import('./candidate-checks.js')

    const [result] = await runTextChecksWithRetry([{ title: 'Fall Festival', address: 'Northalsted' }], 'The festival happens at 3252 N Broadway.')

    expect(createMock).toHaveBeenCalledTimes(2)
    expect(result.checks.addressQuality).toEqual({ pass: true, reason: 'found the real address in the source text', attempts: 2 })
    expect(result.correctedFields).toEqual({ address: '3252 N Broadway' })
    // Untouched checks stay at attempts: 1 — only the ones actually retried change.
    expect(result.checks.titleQuality.attempts).toBe(1)
  })

  it('never retries more than once, even if the retry itself still fails', async () => {
    createMock
      .mockResolvedValueOnce(
        textResponse(
          JSON.stringify([
            {
              titleQuality: { pass: true, reason: 'clear' },
              descriptionQuality: { pass: true, reason: 'informative' },
              locationLabelQuality: { pass: true, reason: 'named venue' },
              addressQuality: { pass: false, reason: 'too vague' },
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(textResponse(JSON.stringify({ addressQuality: { pass: false, reason: 'source text has no better address either' } })))
    const { runTextChecksWithRetry } = await import('./candidate-checks.js')

    const [result] = await runTextChecksWithRetry([{ title: 'Fall Festival', address: 'Northalsted' }])

    expect(createMock).toHaveBeenCalledTimes(2)
    expect(result.checks.addressQuality).toEqual({ pass: false, reason: 'source text has no better address either', attempts: 2 })
  })

  it('fails open (every check passes) when there is no API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { runTextChecksWithRetry } = await import('./candidate-checks.js')

    const [result] = await runTextChecksWithRetry([{ title: 'Fall Festival' }])

    expect(result.checks.titleQuality.pass).toBe(true)
    expect(result.checks.addressQuality.pass).toBe(true)
    expect(createMock).not.toHaveBeenCalled()
  })
})
