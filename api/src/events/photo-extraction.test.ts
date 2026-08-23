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

describe('extractEventFromPhoto', () => {
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
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/flyer.jpeg')

    expect(result).toEqual({
      title: 'Family Fun Fest',
      description: undefined,
      start_date: '2026-09-20',
      start_time: '11:00',
      all_day: false,
      address: undefined,
      location_name: 'Hawthorne Scholastic Academy Turf',
      topic: 'Community & Social',
    })
    expect(getImageObjectMock).toHaveBeenCalledWith('events/flyer.jpeg')
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
    )
  })

  it('drops a topic the model invents that is not in the fixed list', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(
      textResponse(JSON.stringify({ found: true, title: 'Bake Sale', start_date: '2026-09-20', all_day: true, topic: 'Food' })),
    )
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/flyer.jpeg')

    expect(result?.topic).toBeUndefined()
  })

  it('strips a markdown code fence around the JSON response', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(
      textResponse('```json\n' + JSON.stringify({ found: true, title: 'Fenced Event', start_date: '2026-09-20', all_day: true }) + '\n```'),
    )
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/flyer.jpeg')

    expect(result?.title).toBe('Fenced Event')
  })

  it('returns null when the model could not find a real event', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: false })))
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/blurry.jpeg')

    expect(result).toBeNull()
  })

  it('returns null when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/flyer.jpeg')

    expect(result).toBeNull()
    expect(getImageObjectMock).not.toHaveBeenCalled()
  })

  it('returns null when the image cannot be found in the bucket', async () => {
    getImageObjectMock.mockResolvedValue(null)
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/missing.jpeg')

    expect(result).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns null when the response is not valid JSON', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(textResponse('not json'))
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/flyer.jpeg')

    expect(result).toBeNull()
  })

  it('returns null when the model refuses', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(textResponse('', 'refusal'))
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/flyer.jpeg')

    expect(result).toBeNull()
  })

  it('uses a source_url printed on the poster and never falls back to a search', async () => {
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
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/flyer.jpeg')

    expect(result?.source_url).toBe('https://hsapta.org/family-fun-fest')
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to a live web search for a source URL when the poster has none', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock
      .mockResolvedValueOnce(
        textResponse(
          JSON.stringify({ found: true, title: 'Family Fun Fest', start_date: '2026-09-20', all_day: true, location_name: 'Hawthorne' }),
        ),
      )
      .mockResolvedValueOnce(
        textResponse(JSON.stringify({ found: true, url: 'https://hawthorne.example/events', source_name: 'Hawthorne Scholastic Academy' })),
      )
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/flyer.jpeg')

    expect(result?.source_url).toBe('https://hawthorne.example/events')
    expect(result?.source_name).toBe('Hawthorne Scholastic Academy')
    expect(createMock).toHaveBeenCalledTimes(2)
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tools: [expect.objectContaining({ type: 'web_search_20260209', name: 'web_search' })],
      }),
    )
  })

  it('leaves source_url unset when the fallback search finds nothing confident', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock
      .mockResolvedValueOnce(textResponse(JSON.stringify({ found: true, title: 'Bake Sale', start_date: '2026-09-20', all_day: true })))
      .mockResolvedValueOnce(textResponse(JSON.stringify({ found: false })))
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/flyer.jpeg')

    expect(result?.source_url).toBeUndefined()
    expect(result?.source_name).toBeUndefined()
  })

  it('ignores a non-http source_url the model invents', async () => {
    getImageObjectMock.mockResolvedValue(imageObject())
    createMock.mockResolvedValue(
      textResponse(
        JSON.stringify({ found: true, title: 'Bake Sale', start_date: '2026-09-20', all_day: true, source_url: 'not a real url' }),
      ),
    )
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    const result = await extractEventFromPhoto('/uploads/events/flyer.jpeg')

    // Falls through to the search fallback since the poster's own source_url
    // didn't survive validation — the mocked response has no real search
    // answer shape either, so it stays unset either way.
    expect(result?.source_url).toBeUndefined()
    expect(createMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to image/jpeg for an unsupported content type', async () => {
    getImageObjectMock.mockResolvedValue(imageObject('application/octet-stream'))
    createMock.mockResolvedValue(textResponse(JSON.stringify({ found: true, title: 'Event', start_date: '2026-09-20', all_day: true })))
    const { extractEventFromPhoto } = await import('./photo-extraction.js')

    await extractEventFromPhoto('/uploads/events/flyer.bin')

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: [expect.objectContaining({ source: expect.objectContaining({ media_type: 'image/jpeg' }) }), expect.anything()],
          }),
        ],
      }),
    )
  })
})
