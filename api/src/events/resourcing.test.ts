import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()
const fetchWithTimeoutMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: createMock }
  }
  return { default: MockAnthropic }
})

vi.mock('../uploads/fetch-with-timeout.js', () => ({ fetchWithTimeout: fetchWithTimeoutMock }))
vi.mock('../db/client.js', () => ({ db: {} }))
// ingest.js -> image-enrichment.js -> uploads/storage.js constructs a real S3
// client from env vars at module load — irrelevant to this file's tests, but
// must be stubbed so importing resourcing.js doesn't require real bucket
// credentials.
vi.mock('../uploads/storage.js', () => ({ imageUrl: (key: string) => key, uploadImage: vi.fn() }))

function htmlResponse(html: string) {
  return {
    ok: true,
    headers: new Map([['content-type', 'text/html']]),
    text: async () => html,
  }
}

function textResponse(text: string, stopReason = 'end_turn') {
  return { stop_reason: stopReason, content: [{ type: 'text', text }] }
}

describe('extractCandidateEventsFromSource', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    fetchWithTimeoutMock.mockReset()
    vi.resetModules()
  })

  it('returns candidate events and a content hash from a successful model call', async () => {
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse('<body>Family Movie Night, Aug 10, 6pm</body>'))
    createMock.mockResolvedValue(
      textResponse(
        JSON.stringify([
          {
            title: 'Family Movie Night',
            start_date: '2099-08-10',
            start_time: '18:00',
            all_day: false,
            location_name: 'Music Box Theatre',
          },
        ]),
      ),
    )
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', 'only the family series')

    expect(result.candidates).toEqual([
      {
        title: 'Family Movie Night',
        description: undefined,
        startDate: '2099-08-10',
        startTime: '18:00',
        allDay: false,
        address: undefined,
        locationName: 'Music Box Theatre',
        sourceUrl: 'https://example.com/events',
        status: 'approved',
      },
    ])
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-5',
        messages: [
          expect.objectContaining({
            content: expect.stringContaining('"source_notes":"only the family series"'),
          }),
        ],
      }),
    )
  })

  // The real fix for the 2026-09-03 duplicate-events incident (see
  // CLAUDE.md's Events data model & sourcing section): this model has no
  // temperature/top_p knob, so a second extraction over the identical page
  // text is not safe to run at all — it reliably produces near-duplicate
  // titles instead of a clean "nothing new" skip. Verified this fails
  // against the pre-fix code (the LLM call would fire a second time) before
  // landing the fix, same "verify the guard is real" discipline as this
  // codebase's other regression tests.
  it('skips the model call entirely when the page content hash matches the previous check', async () => {
    const html = '<body>Family Movie Night, Aug 10, 6pm</body>'
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse(html))
    createMock.mockResolvedValue(
      textResponse(JSON.stringify([{ title: 'Family Movie Night', start_date: '2099-08-10', all_day: true }])),
    )
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const first = await extractCandidateEventsFromSource('https://example.com/events', null)
    expect(createMock).toHaveBeenCalledTimes(1)

    const second = await extractCandidateEventsFromSource('https://example.com/events', null, first.contentHash)

    expect(second).toEqual({ candidates: [], contentHash: first.contentHash })
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('re-runs the model call when the page content hash has changed', async () => {
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse('<body>Updated event listing</body>'))
    createMock.mockResolvedValue(
      textResponse(JSON.stringify([{ title: 'New Event', start_date: '2099-08-10', all_day: true }])),
    )
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null, 'a-completely-different-hash')

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(result.candidates).toHaveLength(1)
  })

  it('filters out events the model returned in the past', async () => {
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse('<body>Old Event</body>'))
    createMock.mockResolvedValue(
      textResponse(JSON.stringify([{ title: 'Old Event', start_date: '2020-01-01', all_day: true }])),
    )
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result.candidates).toEqual([])
  })

  it('strips a markdown code fence around the JSON response', async () => {
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse('<body>Event</body>'))
    createMock.mockResolvedValue(
      textResponse('```json\n' + JSON.stringify([{ title: 'Fenced Event', start_date: '2099-01-01', all_day: true }]) + '\n```'),
    )
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].title).toBe('Fenced Event')
  })

  it('returns nothing when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result).toEqual({ candidates: [], contentHash: null })
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
  })

  it('returns nothing when the page fetch fails', async () => {
    fetchWithTimeoutMock.mockResolvedValue(null)
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result).toEqual({ candidates: [], contentHash: null })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns nothing (and no hash to persist) when the response is not valid JSON', async () => {
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse('<body>Event</body>'))
    createMock.mockResolvedValue(textResponse('not json'))
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result).toEqual({ candidates: [], contentHash: null })
  })

  it('returns nothing when the model refuses', async () => {
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse('<body>Event</body>'))
    createMock.mockResolvedValue(textResponse('', 'refusal'))
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result).toEqual({ candidates: [], contentHash: null })
  })
})
