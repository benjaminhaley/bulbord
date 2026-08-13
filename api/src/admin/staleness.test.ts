import { describe, expect, it } from 'vitest'

import { computeDataFreshness } from './staleness.js'

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

describe('computeDataFreshness', () => {
  const now = new Date('2026-08-13T12:00:00Z')

  it('is not stale when both timestamps are within the window', () => {
    const result = computeDataFreshness('2026-08-10T00:00:00Z', '2026-08-12T00:00:00Z', STALE_AFTER_MS, now)
    expect(result.isStale).toBe(false)
    expect(result.oldestAt).toEqual(new Date('2026-08-10T00:00:00Z'))
  })

  it('is stale when the oldest of the two is more than 7 days back', () => {
    const result = computeDataFreshness('2026-07-01T00:00:00Z', '2026-08-12T00:00:00Z', STALE_AFTER_MS, now)
    expect(result.isStale).toBe(true)
    expect(result.oldestAt).toEqual(new Date('2026-07-01T00:00:00Z'))
  })

  it('treats a never-checked side (null) as maximally stale', () => {
    const result = computeDataFreshness(null, '2026-08-12T00:00:00Z', STALE_AFTER_MS, now)
    expect(result.isStale).toBe(true)
    expect(result.oldestAt).toBeNull()
  })

  // Regression test: drizzle's sql<Date | null> aggregate queries hand back
  // a raw string at runtime (the driver's own max(timestamp) result), not a
  // real Date instance, despite the query's TS annotation claiming
  // otherwise — calling .getTime() directly on that string blew up in
  // production (500, "oldestAt.getTime is not a function") the first time
  // this endpoint was actually hit with real data. Real Date instances (as
  // a caller might also reasonably pass) must keep working too.
  it('handles raw string timestamps the same as real Date instances', () => {
    const fromStrings = computeDataFreshness('2026-08-01T00:00:00.000Z', '2026-08-05T00:00:00.000Z', STALE_AFTER_MS, now)
    const fromDates = computeDataFreshness(new Date('2026-08-01T00:00:00.000Z'), new Date('2026-08-05T00:00:00.000Z'), STALE_AFTER_MS, now)
    expect(fromStrings).toEqual(fromDates)
    expect(() => fromStrings.oldestAt!.getTime()).not.toThrow()
  })
})
