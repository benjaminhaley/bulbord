import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()
const getImageObjectMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: createMock }
  }
  return { default: MockAnthropic }
})

vi.mock('../uploads/storage.js', () => ({ getImageObject: getImageObjectMock }))

function textResponse(text: string, stopReason = 'end_turn') {
  return { stop_reason: stopReason, content: [{ type: 'text', text }] }
}

// getImageObject's real return shape (uploads/storage.ts's StoredObject) has
// an async-iterable Readable body — an async generator is enough for
// photo-extraction.ts's own bufferFromStream() to consume, no real stream
// needed.
function imageObject(contentType = 'image/jpeg') {
  return {
    contentType,
    contentLength: 3,
    body: (async function* () {
      yield Buffer.from([1, 2, 3])
    })(),
  }
}

describe('extractEventFieldsFromPhoto', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    getImageObjectMock.mockReset()
    vi.resetModules()
  })

  it('returns extracted fields parsed from a successful model call', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(
      textResponse(
        JSON.stringify({
          found: true,
          title: 'Family Fun Fest',
          start_date: '2026-09-20',
          start_time: '11:00',
          all_day: false,
          location_name: 'Hawthorne Scholastic Academy Turf',
          topic: 'Community & Social',
        }),
      ),
    )
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFieldsFromPhoto('/uploads/events/flyer.jpeg')

    expect(result).toEqual({
      title: 'Family Fun Fest',
      description: undefined,
      start_date: '2026-09-20',
      start_time: '11:00',
      all_day: false,
      address: undefined,
      location_name: 'Hawthorne Scholastic Academy Turf',
      source_url: undefined,
      topic: 'Community & Social',
    })
    expect(getImageObjectMock).toHaveBeenCalledWith('events/flyer.jpeg')
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-5',
        messages: [
          expect.objectContaining({
            content: [
              expect.objectContaining({ type: 'image', source: expect.objectContaining({ media_type: 'image/jpeg' }) }),
              expect.objectContaining({ type: 'text' }),
            ],
          }),
        ],
      }),
      expect.objectContaining({ timeout: expect.any(Number), maxRetries: expect.any(Number) }),
    )
  })

  it('extracts an end_time when the poster gives a time range', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(
      textResponse(
        JSON.stringify({
          found: true,
          title: 'Family Fun Fest',
          start_date: '2026-09-20',
          start_time: '11:00',
          end_time: '15:00',
          all_day: false,
        }),
      ),
    )
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFieldsFromPhoto('/uploads/events/flyer.jpeg')

    expect(result?.start_time).toBe('11:00')
    expect(result?.end_time).toBe('15:00')
  })

  it('extracts a source_url printed on the poster', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(
      textResponse(
        JSON.stringify({
          found: true,
          title: 'Family Fun Fest',
          start_date: '2026-09-20',
          all_day: true,
          source_url: 'https://hsapta.org/family-fun-fest',
        }),
      ),
    )
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFieldsFromPhoto('/uploads/events/flyer.jpeg')

    expect(result?.source_url).toBe('https://hsapta.org/family-fun-fest')
  })

  it('ignores a non-http source_url the model invents', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(
      textResponse(
        JSON.stringify({ found: true, title: 'Bake Sale', start_date: '2026-09-20', all_day: true, source_url: 'not a real url' }),
      ),
    )
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFieldsFromPhoto('/uploads/events/flyer.jpeg')

    expect(result?.source_url).toBeUndefined()
  })

  it('drops a topic the model invents that is not in the fixed list', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(
      textResponse(JSON.stringify({ found: true, title: 'Bake Sale', start_date: '2026-09-20', all_day: true, topic: 'Food' })),
    )
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFieldsFromPhoto('/uploads/events/flyer.jpeg')

    expect(result?.topic).toBeUndefined()
  })

  it('strips a markdown code fence around the JSON response', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(
      textResponse('```json\n' + JSON.stringify({ found: true, title: 'Fenced Event', start_date: '2026-09-20', all_day: true }) + '\n```'),
    )
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFieldsFromPhoto('/uploads/events/flyer.jpeg')

    expect(result?.title).toBe('Fenced Event')
  })

  it('returns null when the model could not find a real event', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: false })))
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFieldsFromPhoto('/uploads/events/blurry.jpeg')

    expect(result).toBeNull()
  })

  it('returns null when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFieldsFromPhoto('/uploads/events/flyer.jpeg')

    expect(result).toBeNull()
    expect(getImageObjectMock).not.toHaveBeenCalled()
  })

  it('returns null when the image cannot be found in the bucket', async () => {
    getImageObjectMock.mockResolvedValue(null)
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFieldsFromPhoto('/uploads/events/missing.jpeg')

    expect(result).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns null when the response is not valid JSON', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(textResponse('not json'))
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFieldsFromPhoto('/uploads/events/flyer.jpeg')

    expect(result).toBeNull()
  })

  it('returns null when the model refuses', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(textResponse('', 'refusal'))
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFieldsFromPhoto('/uploads/events/flyer.jpeg')

    expect(result).toBeNull()
  })

  it('falls back to image/jpeg for an unsupported content type', async () => {
    getImageObjectMock.mockResolvedValue(imageObject('application/octet-stream'))
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: true, title: 'Event', start_date: '2026-09-20', all_day: true })))
    const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

    await extractEventFieldsFromPhoto('/uploads/events/flyer.bin')

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: [expect.objectContaining({ source: expect.objectContaining({ media_type: 'image/jpeg' }) }), expect.anything()],
          }),
        ],
      }),
      expect.anything(),
    )
  })

  // Regression guard for the real production incident (2026-08-23): a
  // request that hung for 25+ minutes with no response and no logged error,
  // because nothing bounded how long the underlying call could take.
  // Fake timers so the test doesn't actually wait out the real deadline —
  // verified as a real guard by confirming it fails without withDeadline's
  // race (a never-resolving createMock would hang forever) and passes with it.
  it('never hangs past the stage deadline even if the model call never resolves', async () => {
    vi.useFakeTimers()
    try {
      getImageObjectMock.mockResolvedValue(imageObject())
      createMock.mockReturnValue(new Promise(() => {})) // never resolves
      const { extractEventFieldsFromPhoto } = await import('./photo-extraction.js')

      const resultPromise = extractEventFieldsFromPhoto('/uploads/events/flyer.jpeg')
      await vi.advanceTimersByTimeAsync(60_000)
      const result = await resultPromise

      expect(result).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('findEventSource', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    vi.resetModules()
  })

  it('returns a discovered source parsed from a successful search call', async () => {
    createMock.mockResolvedValue(
      textResponse(JSON.stringify({ found: true, url: 'https://hawthorneacadpta.org/', source_name: 'Hawthorne Scholastic Academy PTA' })),
    )
    const { findEventSource } = await import('./photo-extraction.js')

    const result = await findEventSource({ title: 'Family Fun Fest', location_name: 'Hawthorne Scholastic Academy', address: undefined })

    expect(result).toEqual({ url: 'https://hawthorneacadpta.org/', sourceName: 'Hawthorne Scholastic Academy PTA' })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ tools: [expect.objectContaining({ type: 'web_search_20260209', name: 'web_search' })] }),
      expect.objectContaining({ timeout: expect.any(Number), maxRetries: expect.any(Number) }),
    )
  })

  it('returns null when the search finds nothing confident', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: false })))
    const { findEventSource } = await import('./photo-extraction.js')

    const result = await findEventSource({ title: 'Bake Sale', location_name: undefined, address: undefined })

    expect(result).toBeNull()
  })

  it('returns null when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { findEventSource } = await import('./photo-extraction.js')

    const result = await findEventSource({ title: 'Bake Sale', location_name: undefined, address: undefined })

    expect(result).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('never hangs past the stage deadline even if the model call never resolves', async () => {
    vi.useFakeTimers()
    try {
      createMock.mockReturnValue(new Promise(() => {})) // never resolves
      const { findEventSource } = await import('./photo-extraction.js')

      const resultPromise = findEventSource({ title: 'Bake Sale', location_name: undefined, address: undefined })
      await vi.advanceTimersByTimeAsync(60_000)
      const result = await resultPromise

      expect(result).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
