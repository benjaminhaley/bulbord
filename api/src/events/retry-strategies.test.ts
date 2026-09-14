import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertMock = vi.fn()
const selectResults: Record<string, unknown>[][] = []

vi.mock('../db/client.js', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(selectResults.shift() ?? []),
  }
  return {
    db: {
      select: () => chain,
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          insertMock(table, values)
          return Promise.resolve()
        },
      }),
    },
  }
})

beforeEach(() => {
  insertMock.mockReset()
  selectResults.length = 0
})

describe('recordRetryNote', () => {
  it('inserts a pipeline_retry_notes row and an events_log entry', async () => {
    const { recordRetryNote } = await import('./retry-strategies.js')

    await recordRetryNote({
      note: 'the price is per week, not per day',
      stage: 'pipeline_review',
      eventId: 'event-1',
      contextTitle: 'Lake View YMCA',
      userId: 'admin-1',
    })

    expect(insertMock).toHaveBeenCalledTimes(2)
    const [, noteValues] = insertMock.mock.calls[0]
    expect(noteValues).toEqual({
      eventId: 'event-1',
      stage: 'pipeline_review',
      note: 'the price is per week, not per day',
      contextTitle: 'Lake View YMCA',
      createdByUserId: 'admin-1',
    })
    const [, logValues] = insertMock.mock.calls[1]
    expect(logValues).toEqual({
      actor: 'admin-1',
      action: 'pipeline_retry_note_added',
      metadata: { stage: 'pipeline_review', eventId: 'event-1', note: 'the price is per week, not per day' },
    })
  })

  it('is a no-op for a blank/whitespace-only note', async () => {
    const { recordRetryNote } = await import('./retry-strategies.js')

    await recordRetryNote({ note: '   ', stage: 'photo_extraction', userId: 'user-1' })

    expect(insertMock).not.toHaveBeenCalled()
  })

  it('defaults eventId/contextTitle to null when not given (a pre-post retry, before any event exists)', async () => {
    const { recordRetryNote } = await import('./retry-strategies.js')

    await recordRetryNote({ note: 'read the QR code in the photo', stage: 'photo_extraction', userId: 'user-1' })

    const [, noteValues] = insertMock.mock.calls[0]
    expect(noteValues).toEqual({
      eventId: null,
      stage: 'photo_extraction',
      note: 'read the QR code in the photo',
      contextTitle: null,
      createdByUserId: 'user-1',
    })
  })
})

describe('getRetryStrategiesPromptBlock', () => {
  it('returns an empty string when there are no notes', async () => {
    selectResults.push([])
    const { getRetryStrategiesPromptBlock } = await import('./retry-strategies.js')

    expect(await getRetryStrategiesPromptBlock()).toBe('')
  })

  it('formats notes into a prompt block, including context titles when present', async () => {
    selectResults.push([
      { note: 'read the QR code in the photo', contextTitle: 'Fall Fest' },
      { note: 'the price is per week, not per day', contextTitle: null },
    ])
    const { getRetryStrategiesPromptBlock } = await import('./retry-strategies.js')

    const block = await getRetryStrategiesPromptBlock()

    expect(block).toContain('read the QR code in the photo (from retrying "Fall Fest")')
    expect(block).toContain('the price is per week, not per day')
    expect(block).not.toContain('the price is per week, not per day (from')
  })
})
