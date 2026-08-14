import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertCalls: Record<string, unknown>[] = []
const selectResults: Record<string, unknown>[][] = []
const uploadPlaceholderImageMock = vi.fn()
const simplifyTitleMock = vi.fn()
const lookupMoviePosterMock = vi.fn()
const enrichEventImagesMock = vi.fn()

vi.mock('../db/client.js', () => {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: () => builder,
    from: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(selectResults.shift() ?? []),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        insertCalls.push(row)
        return { returning: () => Promise.resolve([{ id: `generated-${insertCalls.length}` }]) }
      },
    }),
  })
  return { db: builder }
})
vi.mock('../uploads/placeholder.js', () => ({ uploadPlaceholderImage: uploadPlaceholderImageMock }))
vi.mock('./title-normalization.js', () => ({ simplifyTitle: simplifyTitleMock }))
vi.mock('./movie-poster-lookup.js', () => ({ lookupMoviePoster: lookupMoviePosterMock }))
vi.mock('./image-enrichment.js', () => ({ enrichEventImages: enrichEventImagesMock }))

const CANDIDATE = {
  title: 'Back to School Clothing Swap',
  startDate: '2026-08-22',
  allDay: true,
  sourceUrl: 'https://chipublib.bibliocommons.com/events/abc',
  status: 'pending' as const,
}

describe('ingestEvents', () => {
  beforeEach(() => {
    insertCalls.length = 0
    selectResults.length = 0
    uploadPlaceholderImageMock.mockReset().mockResolvedValue({
      imageUrl: '/uploads/events/placeholder.png',
      thumbnailUrl: '/uploads/events/placeholder-thumb.jpg',
    })
    simplifyTitleMock.mockReset().mockImplementation(async ({ title }: { title: string }) => title)
    lookupMoviePosterMock.mockReset().mockResolvedValue(null)
    enrichEventImagesMock.mockReset().mockResolvedValue({ sourced: 0, none: 1 })
  })

  it('generates and inserts a placeholder image up front, before any async enrichment runs', async () => {
    selectResults.push([]) // no existing duplicate
    const { ingestEvents } = await import('./ingest.js')

    const result = await ingestEvents([CANDIDATE], { sourceId: 'source-1', actor: 'test' })

    expect(result).toEqual({ inserted: 1, skipped: 0 })
    expect(uploadPlaceholderImageMock).toHaveBeenCalledWith('Back to School Clothing Swap', 'events')
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        imageUrl: '/uploads/events/placeholder.png',
        thumbnailUrl: '/uploads/events/placeholder-thumb.jpg',
      }),
    )
  })

  it('never leaves imageUrl/thumbnailUrl undefined on the insert, satisfying the NOT NULL columns immediately', async () => {
    selectResults.push([])
    const { ingestEvents } = await import('./ingest.js')

    await ingestEvents([CANDIDATE], { sourceId: 'source-1', actor: 'test' })

    expect(insertCalls[0].imageUrl).toBeTypeOf('string')
    expect(insertCalls[0].thumbnailUrl).toBeTypeOf('string')
  })

  it('skips placeholder generation entirely for a candidate that dedups against an existing row', async () => {
    selectResults.push([{ id: 'existing-event' }]) // duplicate found
    const { ingestEvents } = await import('./ingest.js')

    const result = await ingestEvents([CANDIDATE], { sourceId: 'source-1', actor: 'test' })

    expect(result).toEqual({ inserted: 0, skipped: 1 })
    expect(uploadPlaceholderImageMock).not.toHaveBeenCalled()
    // The only insert() call left is ingestEvents' own events_log audit
    // entry — no event row (and so no placeholder) was ever created.
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0]).toEqual(expect.objectContaining({ action: 'events_ingested' }))
  })

  it('still hands the inserted row to enrichEventImages, which can upgrade the placeholder to a real photo', async () => {
    selectResults.push([])
    const { ingestEvents } = await import('./ingest.js')

    await ingestEvents([CANDIDATE], { sourceId: 'source-1', actor: 'test' })

    expect(enrichEventImagesMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'generated-1', sourceUrl: CANDIDATE.sourceUrl }),
    ])
  })
})
