import { describe, expect, it } from 'vitest'

import { type DataFreshness } from '../admin/api'
import { describeFreshnessAlert, freshnessAlertTargetPath, freshnessSignature } from './NotificationsPage'

function freshness(overrides: Partial<DataFreshness>): DataFreshness {
  return {
    events_last_checked_at: null,
    camps_last_updated_at: null,
    oldest_at: null,
    is_stale: false,
    recurring_series_running_low: [],
    ...overrides,
  }
}

// Feedback #132: this row is the only place the old avatar badge's "what's
// wrong" text now lives, so it needs to say something whenever either axis
// of admin/data-freshness would previously have lit up that badge.
describe('describeFreshnessAlert', () => {
  it('returns null when nothing is null or given', () => {
    expect(describeFreshnessAlert(null)).toBeNull()
    expect(describeFreshnessAlert(freshness({}))).toBeNull()
  })

  it('describes stale data alone', () => {
    expect(describeFreshnessAlert(freshness({ is_stale: true }))).toBe('Events/camps data needs a refresh — tap for details')
  })

  it('describes one running-low series with singular wording', () => {
    const result = describeFreshnessAlert(
      freshness({
        recurring_series_running_low: [
          {
            title: 'Nettelhorst French Market',
            source_id: 'src-1',
            source_name: 'Nettelhorst French Market',
            occurrence_count: 5,
            last_occurrence_date: '2026-09-01',
            typical_gap_days: 7,
            days_until_last_occurrence: -2,
          },
        ],
      }),
    )
    expect(result).toBe('1 recurring listing running low on confirmed dates — tap for details')
  })

  it('describes multiple running-low series with plural wording', () => {
    const lowSeries: DataFreshness['recurring_series_running_low'][number] = {
      title: 'Some Series',
      source_id: null,
      source_name: null,
      occurrence_count: 3,
      last_occurrence_date: '2026-09-01',
      typical_gap_days: 7,
      days_until_last_occurrence: -2,
    }
    const result = describeFreshnessAlert(freshness({ recurring_series_running_low: [lowSeries, lowSeries] }))
    expect(result).toBe('2 recurring listings running low on confirmed dates — tap for details')
  })

  it('combines both when both are true', () => {
    const lowSeries: DataFreshness['recurring_series_running_low'][number] = {
      title: 'Some Series',
      source_id: null,
      source_name: null,
      occurrence_count: 3,
      last_occurrence_date: '2026-09-01',
      typical_gap_days: 7,
      days_until_last_occurrence: -2,
    }
    const result = describeFreshnessAlert(freshness({ is_stale: true, recurring_series_running_low: [lowSeries] }))
    expect(result).toBe('Events/camps data needs a refresh — 1 recurring listing running low on confirmed dates — tap for details')
  })
})

// Feedback #140: "I don't get directed to anything actionable" — the alert
// used to always point at bare /admin/dev-tools, leaving an admin to scroll
// a long page looking for whatever triggered it.
describe('freshnessAlertTargetPath', () => {
  it('points at bare dev-tools when nothing is flagged or freshness is null', () => {
    expect(freshnessAlertTargetPath(null)).toBe('/admin/dev-tools')
    expect(freshnessAlertTargetPath(freshness({}))).toBe('/admin/dev-tools')
  })

  it('points at the sourcing section when only stale', () => {
    expect(freshnessAlertTargetPath(freshness({ is_stale: true }))).toBe('/admin/dev-tools#sourcing-and-data')
  })

  it('points at the recurring-series section when any series is running low', () => {
    const lowSeries: DataFreshness['recurring_series_running_low'][number] = {
      title: 'Some Series',
      source_id: null,
      source_name: null,
      occurrence_count: 3,
      last_occurrence_date: '2026-09-01',
      typical_gap_days: 7,
      days_until_last_occurrence: -2,
    }
    expect(freshnessAlertTargetPath(freshness({ recurring_series_running_low: [lowSeries] }))).toBe(
      '/admin/dev-tools#recurring-series-health',
    )
  })

  it('prefers the recurring-series anchor when both are true', () => {
    const lowSeries: DataFreshness['recurring_series_running_low'][number] = {
      title: 'Some Series',
      source_id: null,
      source_name: null,
      occurrence_count: 3,
      last_occurrence_date: '2026-09-01',
      typical_gap_days: 7,
      days_until_last_occurrence: -2,
    }
    expect(freshnessAlertTargetPath(freshness({ is_stale: true, recurring_series_running_low: [lowSeries] }))).toBe(
      '/admin/dev-tools#recurring-series-health',
    )
  })
})

// Follow-up to feedback #140 ("I clicked the alert and it didn't go away")
// — the alert has no real DB row to dismiss via API, so a stable signature
// of exactly what's currently flagged is what NotificationsPage compares
// against a stored "last dismissed" value to decide whether to still show it.
describe('freshnessSignature', () => {
  const series = (overrides: Partial<DataFreshness['recurring_series_running_low'][number]> = {}) => ({
    title: 'Some Series',
    source_id: 'src-1',
    source_name: 'Some Source',
    occurrence_count: 3,
    last_occurrence_date: '2026-09-01',
    typical_gap_days: 7,
    days_until_last_occurrence: -2,
    ...overrides,
  })

  it('returns null when freshness itself is null', () => {
    expect(freshnessSignature(null)).toBeNull()
  })

  it('is stable for the exact same freshness content', () => {
    const a = freshnessSignature(freshness({ is_stale: true, recurring_series_running_low: [series()] }))
    const b = freshnessSignature(freshness({ is_stale: true, recurring_series_running_low: [series()] }))
    expect(a).toBe(b)
  })

  it('is order-independent across multiple flagged series', () => {
    const s1 = series({ source_id: 'src-1', title: 'A' })
    const s2 = series({ source_id: 'src-2', title: 'B' })
    const forward = freshnessSignature(freshness({ recurring_series_running_low: [s1, s2] }))
    const reversed = freshnessSignature(freshness({ recurring_series_running_low: [s2, s1] }))
    expect(forward).toBe(reversed)
  })

  it('changes when is_stale flips', () => {
    const notStale = freshnessSignature(freshness({ is_stale: false }))
    const stale = freshnessSignature(freshness({ is_stale: true }))
    expect(notStale).not.toBe(stale)
  })

  it('changes when a series is added, removed, or its last occurrence date changes', () => {
    const base = freshnessSignature(freshness({ recurring_series_running_low: [series()] }))
    const added = freshnessSignature(freshness({ recurring_series_running_low: [series(), series({ source_id: 'src-2' })] }))
    const removed = freshnessSignature(freshness({ recurring_series_running_low: [] }))
    const changedDate = freshnessSignature(freshness({ recurring_series_running_low: [series({ last_occurrence_date: '2026-09-08' })] }))
    expect(added).not.toBe(base)
    expect(removed).not.toBe(base)
    expect(changedDate).not.toBe(base)
  })
})
