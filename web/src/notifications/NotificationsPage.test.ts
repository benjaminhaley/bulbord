import { describe, expect, it } from 'vitest'

import { type DataFreshness } from '../admin/api'
import { describeFreshnessAlert, freshnessAlertTargetPath } from './NotificationsPage'

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
