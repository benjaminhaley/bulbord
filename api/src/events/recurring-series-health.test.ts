import { describe, expect, it } from 'vitest'

import { findLowRecurringSeries, type RecurringSeriesRow } from './recurring-series-health.js'

function row(title: string, startDate: string, sourceId = 'src-1', sourceName = 'Some Source'): RecurringSeriesRow {
  return { title, startDate, sourceId, sourceName }
}

describe('findLowRecurringSeries', () => {
  it('flags a weekly series whose last occurrence is in the past', () => {
    const rows = [row('French Market', '2026-08-01'), row('French Market', '2026-08-08'), row('French Market', '2026-08-15')]
    const result = findLowRecurringSeries(rows, '2026-08-22')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      title: 'French Market',
      occurrenceCount: 3,
      lastOccurrenceDate: '2026-08-15',
      typicalGapDays: 7,
      daysUntilLastOccurrence: -7,
    })
  })

  it('does not flag a weekly series with plenty of runway left', () => {
    const rows = [row('Green City Market', '2026-08-01'), row('Green City Market', '2026-08-08'), row('Green City Market', '2026-09-15')]
    // Last occurrence is 24 days out, well beyond the ~7-day typical gap.
    expect(findLowRecurringSeries(rows, '2026-08-22')).toHaveLength(0)
  })

  it('never flags a series with only one historical occurrence', () => {
    // Indistinguishable from a genuine one-time annual festival — this is
    // the case that must never produce a false positive.
    const rows = [row('Oktoberfest Chicago', '2026-09-25')]
    expect(findLowRecurringSeries(rows, '2026-08-22')).toHaveLength(0)
  })

  it('scales the threshold to a monthly cadence rather than a flat day count', () => {
    // Last occurrence is 20 days out — would be "healthy" for a weekly
    // series but is "running low" for a monthly one, since less than one
    // full cadence-cycle of runway remains.
    const rows = [row('Sunday Crafternoon', '2026-06-07'), row('Sunday Crafternoon', '2026-07-05'), row('Sunday Crafternoon', '2026-08-02')]
    const result = findLowRecurringSeries(rows, '2026-07-13')
    expect(result).toHaveLength(1)
    expect(result[0].typicalGapDays).toBe(28)
  })

  it('reports the most recent occurrence source, not the earliest', () => {
    const rows = [
      row('French Market', '2026-08-01', 'bucket-source', 'Generic web search'),
      row('French Market', '2026-08-08', 'bucket-source', 'Generic web search'),
      row('French Market', '2026-08-15', 'dedicated-source', 'Nettelhorst French Market'),
    ]
    const result = findLowRecurringSeries(rows, '2026-08-22')
    expect(result[0].sourceId).toBe('dedicated-source')
    expect(result[0].sourceName).toBe('Nettelhorst French Market')
  })

  it('sorts most-overdue first when multiple series are flagged', () => {
    const rows = [
      row('Series A', '2026-08-01'),
      row('Series A', '2026-08-08'),
      row('Series A', '2026-08-15'), // 7 days overdue as of 2026-08-22
      row('Series B', '2026-08-01'),
      row('Series B', '2026-08-08'),
      row('Series B', '2026-08-20'), // 2 days overdue
    ]
    const result = findLowRecurringSeries(rows, '2026-08-22')
    expect(result.map((r) => r.title)).toEqual(['Series A', 'Series B'])
  })
})
