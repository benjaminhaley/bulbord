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

  it('returns candidate events parsed from a successful model call', async () => {
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

    expect(result).toEqual([
      {
        title: 'Family Movie Night',
        description: undefined,
        startDate: '2099-08-10',
        startTime: '18:00',
        allDay: false,
        address: undefined,
        locationName: 'Music Box Theatre',
        sourceUrl: 'https://example.com/events',
        status: 'pending',
      },
    ])
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

  it('filters out events the model returned in the past', async () => {
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse('<body>Old Event</body>'))
    createMock.mockResolvedValue(
      textResponse(JSON.stringify([{ title: 'Old Event', start_date: '2020-01-01', all_day: true }])),
    )
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result).toEqual([])
  })

  it('strips a markdown code fence around the JSON response', async () => {
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse('<body>Event</body>'))
    createMock.mockResolvedValue(
      textResponse('```json\n' + JSON.stringify([{ title: 'Fenced Event', start_date: '2099-01-01', all_day: true }]) + '\n```'),
    )
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Fenced Event')
  })

  it('returns nothing when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result).toEqual([])
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
  })

  it('returns nothing when the page fetch fails', async () => {
    fetchWithTimeoutMock.mockResolvedValue(null)
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result).toEqual([])
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns nothing when the response is not valid JSON', async () => {
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse('<body>Event</body>'))
    createMock.mockResolvedValue(textResponse('not json'))
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result).toEqual([])
  })

  it('returns nothing when the model refuses', async () => {
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse('<body>Event</body>'))
    createMock.mockResolvedValue(textResponse('', 'refusal'))
    const { extractCandidateEventsFromSource } = await import('./resourcing.js')

    const result = await extractCandidateEventsFromSource('https://example.com/events', null)

    expect(result).toEqual([])
  })
})
