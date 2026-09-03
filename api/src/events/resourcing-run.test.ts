import { beforeEach, describe, expect, it, vi } from 'vitest'

import { eventSources, eventsLog } from '../db/schema.js'

const ingestEventsMock = vi.fn()

let sourceRows: { id: string; name: string; url: string; notes: string | null }[] = []
let sourceSelectCallCount = 0
let lastCheckedAtValue: Date | null = null
let latestLogRows: { actor: string; createdAt: Date; metadata: unknown }[] = []
const insertedRows: { table: unknown; row: Record<string, unknown> }[] = []
const updateCalls: { where: unknown }[] = []

vi.mock('../claude.js', () => ({
  // Short-circuits extractCandidateEventsFromSource to `[]` without a real
  // network/model call — this file only cares about how
  // resourceActiveEventSources aggregates and persists ingestEvents' own
  // (mocked) return values, not extraction itself (already covered by
  // resourcing.test.ts).
  getAnthropicClient: () => null,
  stripJsonCodeFence: (s: string) => s,
}))
vi.mock('./ingest.js', () => ({ ingestEvents: ingestEventsMock }))
vi.mock('../db/client.js', () => {
  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table === eventSources) {
          sourceSelectCallCount++
          // Call 1: the full active-sources list. Call 2 (inside
          // getSourcesLastCheckedAt): the scalar max(last_checked_at) row.
          if (sourceSelectCallCount === 1) {
            return { where: () => Promise.resolve(sourceRows) }
          }
          return { where: () => Promise.resolve([{ lastCheckedAt: lastCheckedAtValue }]) }
        }
        if (table === eventsLog) {
          return { where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(latestLogRows) }) }) }
        }
        throw new Error('unexpected table passed to db.select().from()')
      },
    }),
    update: () => ({
      set: () => ({
        where: (whereClause: unknown) => {
          updateCalls.push({ where: whereClause })
          return Promise.resolve()
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: Record<string, unknown>) => {
        insertedRows.push({ table, row })
        return Promise.resolve()
      },
    }),
  }
  return { db }
})

describe('resourceActiveEventSources', () => {
  beforeEach(() => {
    ingestEventsMock.mockReset()
    sourceRows = [
      { id: 'source-1', name: 'Merlo Library', url: 'https://example.com/1', notes: null },
      { id: 'source-2', name: 'Lakeview Chamber', url: 'https://example.com/2', notes: null },
    ]
    sourceSelectCallCount = 0
    // A real string, not a Date, deliberately — postgres.js hands back a
    // string for a raw sql max(timestamp) aggregate at runtime despite
    // getSourcesLastCheckedAt()'s own `Date | null` return type (same
    // gotcha admin/staleness.ts documents); a live admin request crashed
    // on `.toISOString is not a function` the first time this shipped
    // because the test above it used a real Date and never caught it.
    lastCheckedAtValue = '2026-09-03T12:00:00.000Z' as unknown as Date
    latestLogRows = []
    insertedRows.length = 0
    updateCalls.length = 0
  })

  it('aggregates each source\'s ingestEvents() result and writes one summary log entry', async () => {
    ingestEventsMock.mockResolvedValueOnce({ inserted: 3, skipped: 1 }).mockResolvedValueOnce({ inserted: 0, skipped: 2 })
    const { resourceActiveEventSources } = await import('./resourcing.js')

    const report = await resourceActiveEventSources('system:event-sourcing-cron')

    expect(report.sourcesChecked).toBe(2)
    expect(report.totalAdded).toBe(3)
    expect(report.totalSkipped).toBe(3)
    expect(report.results).toEqual(
      expect.arrayContaining([
        { sourceId: 'source-1', name: 'Merlo Library', added: 3, skipped: 1 },
        { sourceId: 'source-2', name: 'Lakeview Chamber', added: 0, skipped: 2 },
      ]),
    )
    expect(updateCalls).toHaveLength(2)

    const summaryInsert = insertedRows.find((r) => r.table === eventsLog)
    expect(summaryInsert).toBeDefined()
    expect(summaryInsert!.row).toMatchObject({ actor: 'system:event-sourcing-cron', action: 'event_sourcing_run' })
    expect(summaryInsert!.row.metadata).toMatchObject({
      sourcesChecked: 2,
      totalAdded: 3,
      totalSkipped: 3,
      lastCheckedAt: '2026-09-03T12:00:00.000Z',
    })
  })

  it('records a per-source error without failing the whole run', async () => {
    ingestEventsMock.mockResolvedValueOnce({ inserted: 1, skipped: 0 }).mockRejectedValueOnce(new Error('fetch timed out'))
    const { resourceActiveEventSources } = await import('./resourcing.js')

    const report = await resourceActiveEventSources('admin:test-user')

    expect(report.totalAdded).toBe(1)
    const failed = report.results.find((r) => r.sourceId === 'source-2')
    expect(failed).toMatchObject({ added: 0, skipped: 0, error: 'fetch timed out' })
  })
})

describe('getLatestEventSourcingRun', () => {
  beforeEach(() => {
    latestLogRows = []
    sourceSelectCallCount = 0
  })

  it('returns null when no run has ever been logged', async () => {
    const { getLatestEventSourcingRun } = await import('./resourcing.js')

    expect(await getLatestEventSourcingRun()).toBeNull()
  })

  it('parses the most recent event_sourcing_run row back into a summary', async () => {
    const ranAt = new Date('2026-09-01T11:00:00Z')
    latestLogRows = [
      {
        actor: 'system:event-sourcing-cron',
        createdAt: ranAt,
        metadata: {
          sourcesChecked: 2,
          totalAdded: 3,
          totalSkipped: 1,
          lastCheckedAt: '2026-09-01T11:00:01.000Z',
          results: [{ sourceId: 'source-1', name: 'Merlo Library', added: 3, skipped: 1 }],
        },
      },
    ]
    const { getLatestEventSourcingRun } = await import('./resourcing.js')

    const summary = await getLatestEventSourcingRun()

    expect(summary).not.toBeNull()
    expect(summary!.actor).toBe('system:event-sourcing-cron')
    expect(summary!.ranAt).toEqual(ranAt)
    expect(summary!.report.totalAdded).toBe(3)
    expect(summary!.report.lastCheckedAt).toEqual(new Date('2026-09-01T11:00:01.000Z'))
  })
})
