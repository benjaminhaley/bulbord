import { beforeEach, describe, expect, it, vi } from 'vitest'

// Same db/client.js mocking shape as admin/memberDeletion.test.ts and
// events/ingest.test.ts: select() queues consumed in call order (this file's
// functions make more than one select per action in some cases — e.g.
// approveRejectedCandidate looks up the rejected row, then re-looks-up the
// newly inserted event), update() records what was set, insert() is unused
// here (ingestEvents itself is mocked below).
const selectResults: Record<string, unknown>[][] = []
const updateCalls: { table: unknown; set: Record<string, unknown> }[] = []
const enrichEventImageMock = vi.fn()
const ingestEventsMock = vi.fn()
const scoreTextChecksMock = vi.fn()
const recordEditMock = vi.fn()

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
        return {
          where: () => ({ returning: () => Promise.resolve(selectResults.shift() ?? [{ id: 'row-1' }]) }),
        }
      },
    }),
  })
  return { db: builder }
})
vi.mock('./image-enrichment.js', () => ({ enrichEventImage: enrichEventImageMock }))
vi.mock('./ingest.js', () => ({ ingestEvents: ingestEventsMock }))
vi.mock('../edit-history/service.js', () => ({ recordEdit: recordEditMock }))
vi.mock('./candidate-checks.js', async () => {
  const actual = await vi.importActual<typeof import('./candidate-checks.js')>('./candidate-checks.js')
  return { ...actual, scoreTextChecks: scoreTextChecksMock }
})

const PASSING_CHECK = { pass: true, reason: 'ok', attempts: 1 }
const PASSING_TEXT_CHECKS = {
  titleQuality: PASSING_CHECK,
  descriptionQuality: PASSING_CHECK,
  locationLabelQuality: PASSING_CHECK,
  addressQuality: PASSING_CHECK,
}

beforeEach(() => {
  selectResults.length = 0
  updateCalls.length = 0
  enrichEventImageMock.mockReset()
  ingestEventsMock.mockReset()
  scoreTextChecksMock.mockReset().mockResolvedValue([PASSING_TEXT_CHECKS])
  recordEditMock.mockReset()
})

describe('approveEvent', () => {
  it('publishes the event and marks it reviewed with the admin id and an optional note', async () => {
    selectResults.push([{ id: 'event-1' }])
    const { approveEvent } = await import('./pipeline-review-service.js')

    const error = await approveEvent('event-1', 'admin-1', 'looks fine')

    expect(error).toBeNull()
    expect(updateCalls[0].set).toEqual(
      expect.objectContaining({ status: 'approved', pipelineReviewedByUserId: 'admin-1', pipelineReviewNote: 'looks fine' }),
    )
  })

  it("returns 'not_found' when the event doesn't exist (or is already deleted)", async () => {
    selectResults.push([])
    const { approveEvent } = await import('./pipeline-review-service.js')

    const error = await approveEvent('missing', 'admin-1')

    expect(error).toBe('not_found')
  })
})

describe('rejectEvent', () => {
  it('soft-deletes the event and marks it reviewed in the same update', async () => {
    selectResults.push([{ id: 'event-1' }])
    const { rejectEvent } = await import('./pipeline-review-service.js')

    const error = await rejectEvent('event-1', 'admin-1', 'wrong location')

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

describe('editKeptCandidate', () => {
  it('re-scores the text checks against the corrected fields and never changes status', async () => {
    selectResults.push([
      {
        checks: { ...PASSING_TEXT_CHECKS, dateQuality: PASSING_CHECK, timeQuality: PASSING_CHECK, imageQuality: PASSING_CHECK, imageRelevance: PASSING_CHECK, duplicateCheck: PASSING_CHECK },
        title: 'Old Title',
        description: null,
        address: 'Northalsted',
        locationName: null,
        startDate: '2026-10-10',
        startTime: null,
        allDay: true,
      },
    ])
    scoreTextChecksMock.mockResolvedValue([{ ...PASSING_TEXT_CHECKS, addressQuality: { pass: true, reason: 'Now a real address', attempts: 1 } }])
    const { editKeptCandidate } = await import('./pipeline-review-service.js')

    const error = await editKeptCandidate('event-1', { address: '3252 N Broadway' }, 'admin-1')

    expect(error).toBeNull()
    expect(scoreTextChecksMock).toHaveBeenCalledWith([expect.objectContaining({ address: '3252 N Broadway' })])
    expect(updateCalls[0].set).not.toHaveProperty('status')
    expect(updateCalls[0].set).toEqual(expect.objectContaining({ address: '3252 N Broadway', pipelineChecksPassed: true }))
  })

  it("returns 'not_found' when the event doesn't exist", async () => {
    selectResults.push([])
    const { editKeptCandidate } = await import('./pipeline-review-service.js')

    const error = await editKeptCandidate('missing', { title: 'New Title' }, 'admin-1')

    expect(error).toBe('not_found')
  })

  // Feedback #141: an admin's Pipeline Review edit writes into the same
  // shared edit-history table an ordinary member's PATCH does, attributed
  // to the acting admin — not a second, parallel audit trail.
  it('records the edit into the shared edit-history table, attributed to the admin', async () => {
    selectResults.push([
      {
        checks: null,
        title: 'Old Title',
        description: null,
        address: 'Northalsted',
        locationName: null,
        startDate: '2026-10-10',
        startTime: null,
        endTime: null,
        allDay: true,
        sourceUrl: null,
        topic: null,
        imageUrl: 'https://example.com/img.jpg',
        thumbnailUrl: 'https://example.com/thumb.jpg',
      },
    ])
    const { editKeptCandidate } = await import('./pipeline-review-service.js')

    await editKeptCandidate('event-1', { address: '3252 N Broadway' }, 'admin-1')

    expect(recordEditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'event',
        entityId: 'event-1',
        actorUserId: 'admin-1',
        before: expect.objectContaining({ address: 'Northalsted' }),
        after: expect.objectContaining({ address: '3252 N Broadway' }),
      }),
    )
  })
})

describe('retryEventImageForKeptItem', () => {
  it('re-searches with the logo tier scored, and does not mark the event reviewed', async () => {
    selectResults.push([{ id: 'event-1', sourceUrl: 'https://example.com', title: 'Fall Festival', description: null, checks: null, status: 'pending' }])
    enrichEventImageMock.mockResolvedValue({ result: 'sourced', trace: [], imageQuality: PASSING_CHECK, imageRelevance: PASSING_CHECK })
    const { retryEventImageForKeptItem } = await import('./pipeline-review-service.js')

    const error = await retryEventImageForKeptItem('event-1', 'admin-1')

    expect(error).toBeNull()
    expect(enrichEventImageMock).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ sourceUrl: 'https://example.com', title: 'Fall Festival' }),
      { scoreLogos: true, actor: 'admin-1' },
    )
    expect(updateCalls[0].set).not.toHaveProperty('pipelineReviewedAt')
  })

  it('auto-publishes a pending item once every check now passes', async () => {
    const priorChecks = { ...PASSING_TEXT_CHECKS, dateQuality: PASSING_CHECK, timeQuality: PASSING_CHECK, imageQuality: { pass: false, reason: 'none found', attempts: 1 }, imageRelevance: { pass: false, reason: 'none found', attempts: 1 }, duplicateCheck: PASSING_CHECK }
    selectResults.push([{ id: 'event-1', sourceUrl: 'https://example.com', title: 'Fall Festival', description: null, checks: priorChecks, status: 'pending' }])
    enrichEventImageMock.mockResolvedValue({ result: 'sourced', trace: [], imageQuality: PASSING_CHECK, imageRelevance: PASSING_CHECK })
    const { retryEventImageForKeptItem } = await import('./pipeline-review-service.js')

    await retryEventImageForKeptItem('event-1', 'admin-1')

    expect(updateCalls[0].set).toEqual(expect.objectContaining({ status: 'approved', pipelineChecksPassed: true }))
  })

  it("reports 'no_image_found' without treating it as an error", async () => {
    selectResults.push([{ id: 'event-1', sourceUrl: null, title: 'Fall Festival', description: null, checks: null, status: 'pending' }])
    enrichEventImageMock.mockResolvedValue({ result: 'none', trace: [], imageQuality: { pass: false, reason: 'none', attempts: 1 }, imageRelevance: { pass: false, reason: 'none', attempts: 1 } })
    const { retryEventImageForKeptItem } = await import('./pipeline-review-service.js')

    const error = await retryEventImageForKeptItem('event-1', 'admin-1')

    expect(error).toBe('no_image_found')
  })

  it("returns 'not_found' when the event doesn't exist", async () => {
    selectResults.push([])
    const { retryEventImageForKeptItem } = await import('./pipeline-review-service.js')

    const error = await retryEventImageForKeptItem('missing', 'admin-1')

    expect(error).toBe('not_found')
    expect(enrichEventImageMock).not.toHaveBeenCalled()
  })
})

describe('rejectRejectedCandidate', () => {
  it('marks a rejected candidate reviewed with reviewAction "rejected"', async () => {
    selectResults.push([{ id: 'rejected-1' }])
    const { rejectRejectedCandidate } = await import('./pipeline-review-service.js')

    const error = await rejectRejectedCandidate('rejected-1', 'admin-1')

    expect(error).toBeNull()
    expect(updateCalls[0].set).toEqual(expect.objectContaining({ reviewAction: 'rejected' }))
  })
})

describe('editRejectedCandidate', () => {
  it('updates only the stored candidateData snapshot, without inserting anything', async () => {
    selectResults.push([{ candidateData: { title: 'Old', startDate: '2026-10-10', allDay: true, sourceUrl: 'https://example.com', status: 'approved' } }])
    const { editRejectedCandidate } = await import('./pipeline-review-service.js')

    const error = await editRejectedCandidate('rejected-1', { address: '3252 N Broadway' })

    expect(error).toBeNull()
    expect(updateCalls[0].set.candidateData).toEqual(expect.objectContaining({ title: 'Old', address: '3252 N Broadway' }))
    expect(ingestEventsMock).not.toHaveBeenCalled()
  })
})

describe('approveRejectedCandidate', () => {
  const CANDIDATE = {
    title: 'Adults-only Wine Tasting',
    startDate: '2026-10-10',
    allDay: true,
    sourceUrl: 'https://example.com/wine',
    status: 'approved' as const,
  }

  it('rebuilds the candidate and force-publishes it via the real ingestEvents() path, then records the resulting event id', async () => {
    selectResults.push([{ id: 'rejected-1', eventSourceId: 'source-1', candidateData: CANDIDATE }])
    ingestEventsMock.mockResolvedValue({ inserted: 1, skipped: 0 })
    selectResults.push([{ id: 'new-event-1' }]) // the post-insert re-lookup

    const { approveRejectedCandidate } = await import('./pipeline-review-service.js')
    const error = await approveRejectedCandidate('rejected-1', 'admin-1', 'was a real festival after all')

    expect(error).toBeNull()
    expect(ingestEventsMock).toHaveBeenCalledWith([CANDIDATE], { sourceId: 'source-1', actor: 'admin-1', forceApprove: true })
    expect(updateCalls[0].set).toEqual(
      expect.objectContaining({ reviewAction: 'approved', addedAsEventId: 'new-event-1', reviewNote: 'was a real festival after all' }),
    )
  })

  it("reports 'deduped' honestly, without treating it as an error, when ingestEvents() skips the candidate", async () => {
    selectResults.push([{ id: 'rejected-1', eventSourceId: 'source-1', candidateData: CANDIDATE }])
    ingestEventsMock.mockResolvedValue({ inserted: 0, skipped: 1 })

    const { approveRejectedCandidate } = await import('./pipeline-review-service.js')
    const error = await approveRejectedCandidate('rejected-1', 'admin-1')

    expect(error).toBe('deduped')
    expect(updateCalls[0].set).toEqual(expect.objectContaining({ addedAsEventId: null }))
  })

  it("returns 'not_found' when the rejected candidate doesn't exist", async () => {
    selectResults.push([])
    const { approveRejectedCandidate } = await import('./pipeline-review-service.js')

    const error = await approveRejectedCandidate('missing', 'admin-1')

    expect(error).toBe('not_found')
    expect(ingestEventsMock).not.toHaveBeenCalled()
  })
})
