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

describe('extractEventFieldsFromDescription', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    vi.resetModules()
  })

  it('returns fields parsed from a description that states everything', async () => {
    createMock.mockResolvedValue(
      textResponse(
        JSON.stringify({
          found: true,
          title: 'Fall Festival',
          start_date: '2026-09-20',
          start_time: '10:00',
          location_name: 'Nettelhorst Park',
          topic: 'Community & Social',
        }),
      ),
    )
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('Fall Festival at Nettelhorst Park on Sept 20 at 10am')

    expect(result).toEqual({
      title: 'Fall Festival',
      description: undefined,
      start_date: '2026-09-20',
      start_time: '10:00',
      end_time: undefined,
      all_day: false,
      address: undefined,
      location_name: 'Nettelhorst Park',
      source_url: undefined,
      topic: 'Community & Social',
    })
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-5' }),
      expect.objectContaining({ timeout: expect.any(Number), maxRetries: expect.any(Number) }),
    )
    // No web_search tool for stage 1 — it's a fast, text-only read of what
    // the description already states, same as photo-extraction's own
    // vision-only stage 1.
    expect(createMock.mock.calls[0][0].tools).toBeUndefined()
  })

  it('succeeds with just a title when no date can be resolved from the text', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: true, title: 'Nettelhorst Fall Festival' })))
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('the Nettelhorst fall festival')

    expect(result?.title).toBe('Nettelhorst Fall Festival')
    expect(result?.start_date).toBe('')
    expect(result?.all_day).toBe(true)
  })

  it('sets all_day false when a start_time is present, regardless of the model’s own all_day field', async () => {
    createMock.mockResolvedValue(
      textResponse(JSON.stringify({ found: true, title: 'Movie Night', start_date: '2026-09-20', start_time: '19:00', all_day: true })),
    )
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('Movie night this Saturday at 7pm')

    expect(result?.all_day).toBe(false)
    expect(result?.start_time).toBe('19:00')
  })

  it('ignores a non-http source_url the model invents', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: true, title: 'Bake Sale', source_url: 'not a real url' })))
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('bake sale')

    expect(result?.source_url).toBeUndefined()
  })

  it('drops a topic the model invents that is not in the fixed list', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: true, title: 'Bake Sale', topic: 'Food' })))
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('bake sale')

    expect(result?.topic).toBeUndefined()
  })

  it('strips a markdown code fence around the JSON response', async () => {
    createMock.mockResolvedValue(textResponse('```json\n' + JSON.stringify({ found: true, title: 'Fenced Event' }) + '\n```'))
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('some event')

    expect(result?.title).toBe('Fenced Event')
  })

  it('returns null when the description does not describe anything recognizable', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: false })))
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('asdf')

    expect(result).toBeNull()
  })

  it('returns null when no title is present even if found is true', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: true, start_date: '2026-09-20' })))
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('something on Sept 20')

    expect(result).toBeNull()
  })

  it('returns null when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('bake sale')

    expect(result).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns null when the response is not valid JSON', async () => {
    createMock.mockResolvedValue(textResponse('not json'))
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('bake sale')

    expect(result).toBeNull()
  })

  it('returns null when the model refuses', async () => {
    createMock.mockResolvedValue(textResponse('', 'refusal'))
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('bake sale')

    expect(result).toBeNull()
  })

  it('returns null when the model call throws', async () => {
    createMock.mockRejectedValue(new Error('network error'))
    const { extractEventFieldsFromDescription } = await import('./description-extraction.js')

    const result = await extractEventFieldsFromDescription('bake sale')

    expect(result).toBeNull()
  })
})

describe('findEventDetailsFromDescription', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    vi.resetModules()
  })

  it('returns whatever the search confirms, including fields beyond just the source', async () => {
    createMock.mockResolvedValue(
      textResponse(
        JSON.stringify({
          found: true,
          source_url: 'https://nettelhorst.org/fall-festival',
          source_name: 'Nettelhorst PTA',
          start_date: '2026-10-03',
          address: '3252 W Wellington Ave, Chicago, IL',
        }),
      ),
    )
    const { findEventDetailsFromDescription } = await import('./description-extraction.js')

    const result = await findEventDetailsFromDescription('the Nettelhorst fall festival', { title: 'Nettelhorst Fall Festival' })

    expect(result).toEqual({
      source_url: 'https://nettelhorst.org/fall-festival',
      source_name: 'Nettelhorst PTA',
      title: undefined,
      description: undefined,
      start_date: '2026-10-03',
      start_time: undefined,
      end_time: undefined,
      address: '3252 W Wellington Ave, Chicago, IL',
      location_name: undefined,
      topic: undefined,
    })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [expect.objectContaining({ name: 'web_search' })],
      }),
      expect.objectContaining({ timeout: expect.any(Number), maxRetries: expect.any(Number) }),
    )
  })

  it('returns null when found is true but every field came back empty', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: true })))
    const { findEventDetailsFromDescription } = await import('./description-extraction.js')

    const result = await findEventDetailsFromDescription('a vague description', {})

    expect(result).toBeNull()
  })

  it('returns null when the search finds nothing confident', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: false })))
    const { findEventDetailsFromDescription } = await import('./description-extraction.js')

    const result = await findEventDetailsFromDescription('a made-up event that does not exist', {})

    expect(result).toBeNull()
  })

  it('returns null when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { findEventDetailsFromDescription } = await import('./description-extraction.js')

    const result = await findEventDetailsFromDescription('bake sale', {})

    expect(result).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns null when the model refuses', async () => {
    createMock.mockResolvedValue(textResponse('', 'refusal'))
    const { findEventDetailsFromDescription } = await import('./description-extraction.js')

    const result = await findEventDetailsFromDescription('bake sale', {})

    expect(result).toBeNull()
  })

  it('returns null when the model call throws', async () => {
    createMock.mockRejectedValue(new Error('network error'))
    const { findEventDetailsFromDescription } = await import('./description-extraction.js')

    const result = await findEventDetailsFromDescription('bake sale', {})

    expect(result).toBeNull()
  })
})
