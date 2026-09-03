import { describe, expect, it } from 'vitest'

import { type DataFreshness } from '../admin/api'
import { describeFreshnessAlert } from './NotificationsPage'

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
    expect(describeFreshnessAlert(freshness({ is_stale: true }))).toBe('Events/camps data needs a refresh')
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
    expect(result).toBe('1 recurring listing running low on confirmed dates')
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
    expect(result).toBe('2 recurring listings running low on confirmed dates')
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
    expect(result).toBe('Events/camps data needs a refresh — 1 recurring listing running low on confirmed dates')
  })
})
