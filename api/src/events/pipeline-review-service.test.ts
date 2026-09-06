import { beforeEach, describe, expect, it, vi } from 'vitest'

// Same db/client.js mocking shape as admin/memberDeletion.test.ts and
// events/ingest.test.ts: select() queues consumed in call order (this file's
// functions make more than one select per action in some cases — e.g.
// addRejectionAnyway looks up the rejected row, then re-looks-up the newly
// inserted event), update() records what was set, insert() is unused here
// (ingestEvents itself is mocked below).
const selectResults: Record<string, unknown>[][] = []
const updateCalls: { table: unknown; set: Record<string, unknown> }[] = []
const enrichEventImageMock = vi.fn()
const ingestEventsMock = vi.fn()

vi.mock('../db/client.js', () => {
  const builder: Record<string, unknown> = {}
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => ({
      limit: () => Promise.resolve(selectResults.shift() ?? []),
      orderBy: () => ({
        limit: () => Promise.resolve(selectResults.shift() ?? []),
      }),
    }),
  }
  Object.assign(builder, {
    select: () => chain,
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updateCalls.push({ table, set: values })
        return { where: () => ({ returning: () => Promise.resolve(selectResults.shift() ?? [{ id: 'row-1' }]) }) }
      },
    }),
  })
  return { db: builder }
})
vi.mock('./image-enrichment.js', () => ({ enrichEventImage: enrichEventImageMock }))
vi.mock('./ingest.js', () => ({ ingestEvents: ingestEventsMock }))

beforeEach(() => {
  selectResults.length = 0
  updateCalls.length = 0
  enrichEventImageMock.mockReset()
  ingestEventsMock.mockReset()
})

describe('approveEvent', () => {
  it('marks the event reviewed with the admin id and an optional note', async () => {
    selectResults.push([{ id: 'event-1' }])
    const { approveEvent } = await import('./pipeline-review-service.js')

    const error = await approveEvent('event-1', 'admin-1', 'looks fine')

    expect(error).toBeNull()
    expect(updateCalls[0].set).toEqual(
      expect.objectContaining({ pipelineReviewedByUserId: 'admin-1', pipelineReviewNote: 'looks fine' }),
    )
  })

  it("returns 'not_found' when the event doesn't exist (or is already deleted)", async () => {
    selectResults.push([])
    const { approveEvent } = await import('./pipeline-review-service.js')

    const error = await approveEvent('missing', 'admin-1')

    expect(error).toBe('not_found')
  })
})

describe('removeEvent', () => {
  it('soft-deletes the event and marks it reviewed in the same update', async () => {
    selectResults.push([{ id: 'event-1' }])
    const { removeEvent } = await import('./pipeline-review-service.js')

    const error = await removeEvent('event-1', 'admin-1', 'wrong location')

    expect(error).toBeNull()
    expect(updateCalls[0].set).toEqual(
      expect.objectContaining({
        deletedAt: expect.any(Date),
        pipelineReviewedByUserId: 'admin-1',
        pipelineReviewNote: 'wrong location',
      }),
    )
  })
})

describe('retryEventImage', () => {
  it('re-searches with the logo tier scored, and does not mark the event reviewed', async () => {
    selectResults.push([{ id: 'event-1', sourceUrl: 'https://example.com', title: 'Fall Festival', description: null }])
    enrichEventImageMock.mockResolvedValue({ result: 'sourced', trace: [] })
    const { retryEventImage } = await import('./pipeline-review-service.js')

    const error = await retryEventImage('event-1')

    expect(error).toBeNull()
    expect(enrichEventImageMock).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ sourceUrl: 'https://example.com', title: 'Fall Festival' }),
      { scoreLogos: true },
    )
    expect(updateCalls).toHaveLength(0)
  })

  it("reports 'no_image_found' without treating it as an error", async () => {
    selectResults.push([{ id: 'event-1', sourceUrl: null, title: 'Fall Festival', description: null }])
    enrichEventImageMock.mockResolvedValue({ result: 'none', trace: [] })
    const { retryEventImage } = await import('./pipeline-review-service.js')

    const error = await retryEventImage('event-1')

    expect(error).toBe('no_image_found')
  })

  it("returns 'not_found' when the event doesn't exist", async () => {
    selectResults.push([])
    const { retryEventImage } = await import('./pipeline-review-service.js')

    const error = await retryEventImage('missing')

    expect(error).toBe('not_found')
    expect(enrichEventImageMock).not.toHaveBeenCalled()
  })
})

describe('agreeRejection', () => {
  it('marks a rejected candidate reviewed with reviewAction "agreed"', async () => {
    selectResults.push([{ id: 'rejected-1' }])
    const { agreeRejection } = await import('./pipeline-review-service.js')

    const error = await agreeRejection('rejected-1', 'admin-1')

    expect(error).toBeNull()
    expect(updateCalls[0].set).toEqual(expect.objectContaining({ reviewAction: 'agreed' }))
  })
})

describe('addRejectionAnyway', () => {
  const CANDIDATE = {
    title: 'Adults-only Wine Tasting',
    startDate: '2026-10-10',
    allDay: true,
    sourceUrl: 'https://example.com/wine',
    status: 'approved' as const,
  }

  it('rebuilds the candidate and inserts it via the real ingestEvents() path, then records the resulting event id', async () => {
    selectResults.push([{ id: 'rejected-1', eventSourceId: 'source-1', candidateData: CANDIDATE }])
    ingestEventsMock.mockResolvedValue({ inserted: 1, skipped: 0 })
    selectResults.push([{ id: 'new-event-1' }]) // the post-insert re-lookup

    const { addRejectionAnyway } = await import('./pipeline-review-service.js')
    const error = await addRejectionAnyway('rejected-1', 'admin-1', 'was a real festival after all')

    expect(error).toBeNull()
    expect(ingestEventsMock).toHaveBeenCalledWith([CANDIDATE], { sourceId: 'source-1', actor: 'admin-1' })
    expect(updateCalls[0].set).toEqual(
      expect.objectContaining({ reviewAction: 'added_anyway', addedAsEventId: 'new-event-1', reviewNote: 'was a real festival after all' }),
    )
  })

  it("reports 'deduped' honestly, without treating it as an error, when ingestEvents() skips the candidate", async () => {
    selectResults.push([{ id: 'rejected-1', eventSourceId: 'source-1', candidateData: CANDIDATE }])
    ingestEventsMock.mockResolvedValue({ inserted: 0, skipped: 1 })

    const { addRejectionAnyway } = await import('./pipeline-review-service.js')
    const error = await addRejectionAnyway('rejected-1', 'admin-1')

    expect(error).toBe('deduped')
    expect(updateCalls[0].set).toEqual(expect.objectContaining({ addedAsEventId: null }))
  })

  it("returns 'not_found' when the rejected candidate doesn't exist", async () => {
    selectResults.push([])
    const { addRejectionAnyway } = await import('./pipeline-review-service.js')

    const error = await addRejectionAnyway('missing', 'admin-1')

    expect(error).toBe('not_found')
    expect(ingestEventsMock).not.toHaveBeenCalled()
  })
})
