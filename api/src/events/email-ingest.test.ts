import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: createMock }
  }
  return { default: MockAnthropic }
})

vi.mock('../db/client.js', () => ({ db: {} }))
vi.mock('../newsletter/mailer.js', () => ({ resendClient: {} }))
// ingest.js -> image-enrichment.js -> uploads/storage.js constructs a real S3
// client from env vars at module load — irrelevant to this file's tests, but
// must be stubbed so importing email-ingest.js doesn't require real bucket
// credentials, same reasoning as resourcing.test.ts's identical stub.
vi.mock('../uploads/storage.js', () => ({ imageUrl: (key: string) => key, uploadImage: vi.fn() }))

function textResponse(text: string, stopReason = 'end_turn') {
  return { stop_reason: stopReason, content: [{ type: 'text', text }] }
}

describe('extractCandidateEventsFromEmail', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    vi.resetModules()
  })

  it('returns candidate events parsed from a successful model call', async () => {
    createMock.mockResolvedValue(
      textResponse(
        JSON.stringify([
          {
            title: 'Fall Festival',
            start_date: '2099-10-04',
            start_time: '10:00',
            all_day: false,
            location_name: 'Gallagher Way',
            address: '3635 N Clark St, Chicago',
          },
        ]),
      ),
    )
    const { extractCandidateEventsFromEmail } = await import('./email-ingest.js')

    const result = await extractCandidateEventsFromEmail('This weekend', 'Fall Festival, Oct 4, 10am', 'mailto:newsletter@example.org')

    expect(result).toEqual([
      {
        title: 'Fall Festival',
        description: undefined,
        startDate: '2099-10-04',
        startTime: '10:00',
        allDay: false,
        address: '3635 N Clark St, Chicago',
        locationName: 'Gallagher Way',
        sourceUrl: 'mailto:newsletter@example.org',
        status: 'pending',
      },
    ])
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-5',
        messages: [expect.objectContaining({ content: expect.stringContaining('"subject":"This weekend"') })],
      }),
    )
  })

  it('filters out events the model returned in the past', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify([{ title: 'Old Event', start_date: '2020-01-01', all_day: true }])))
    const { extractCandidateEventsFromEmail } = await import('./email-ingest.js')

    const result = await extractCandidateEventsFromEmail('subject', 'body', 'mailto:x@example.org')

    expect(result).toEqual([])
  })

  it('strips a markdown code fence around the JSON response', async () => {
    createMock.mockResolvedValue(
      textResponse('```json\n' + JSON.stringify([{ title: 'Fenced Event', start_date: '2099-01-01', all_day: true }]) + '\n```'),
    )
    const { extractCandidateEventsFromEmail } = await import('./email-ingest.js')

    const result = await extractCandidateEventsFromEmail('subject', 'body', 'mailto:x@example.org')

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Fenced Event')
  })

  it('returns an empty array when the body is empty or whitespace-only', async () => {
    const { extractCandidateEventsFromEmail } = await import('./email-ingest.js')

    const result = await extractCandidateEventsFromEmail('subject', '   ', 'mailto:x@example.org')

    expect(result).toEqual([])
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns nothing when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { extractCandidateEventsFromEmail } = await import('./email-ingest.js')

    const result = await extractCandidateEventsFromEmail('subject', 'real body text', 'mailto:x@example.org')

    expect(result).toEqual([])
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns nothing when the response is not valid JSON', async () => {
    createMock.mockResolvedValue(textResponse('not json'))
    const { extractCandidateEventsFromEmail } = await import('./email-ingest.js')

    const result = await extractCandidateEventsFromEmail('subject', 'body', 'mailto:x@example.org')

    expect(result).toEqual([])
  })

  it('returns nothing when the model refuses', async () => {
    createMock.mockResolvedValue(textResponse('', 'refusal'))
    const { extractCandidateEventsFromEmail } = await import('./email-ingest.js')

    const result = await extractCandidateEventsFromEmail('subject', 'body', 'mailto:x@example.org')

    expect(result).toEqual([])
  })

  it('extracts multiple distinct events from one digest-style email', async () => {
    createMock.mockResolvedValue(
      textResponse(
        JSON.stringify([
          { title: 'Event A', start_date: '2099-01-01', all_day: true },
          { title: 'Event B', start_date: '2099-01-02', all_day: true },
        ]),
      ),
    )
    const { extractCandidateEventsFromEmail } = await import('./email-ingest.js')

    const result = await extractCandidateEventsFromEmail('subject', 'body', 'mailto:x@example.org')

    expect(result.map((c) => c.title)).toEqual(['Event A', 'Event B'])
  })
})

describe('extractBodyText', () => {
  it('prefers plain text when present', async () => {
    const { extractBodyText } = await import('./email-ingest.js')
    expect(extractBodyText('plain text body', '<p>html body</p>')).toBe('plain text body')
  })

  it('falls back to stripping HTML when text is null', async () => {
    const { extractBodyText } = await import('./email-ingest.js')
    expect(extractBodyText(null, '<body><script>ignore()</script><p>Real content</p></body>')).toBe('Real content')
  })

  it('falls back to stripping HTML when text is empty/whitespace', async () => {
    const { extractBodyText } = await import('./email-ingest.js')
    expect(extractBodyText('   ', '<p>Real content</p>')).toBe('Real content')
  })

  it('returns an empty string when neither text nor html is present', async () => {
    const { extractBodyText } = await import('./email-ingest.js')
    expect(extractBodyText(null, null)).toBe('')
  })
})
