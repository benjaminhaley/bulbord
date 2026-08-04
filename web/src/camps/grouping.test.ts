import { describe, expect, it } from 'vitest'

import type { BreakBucket, Camp } from './api'
import { applyInterestUpdateAcrossBuckets, flattenAndDedupeCamps } from './grouping'

function camp(overrides: Partial<Camp> = {}): Camp {
  return {
    id: 'c1',
    title: 'YMCA Summer Camp',
    description: null,
    start_date: '2026-06-08',
    end_date: '2026-06-19',
    address: null,
    location_name: null,
    distance_miles: null,
    price_per_day: null,
    price_is_estimated: false,
    age_min: null,
    spots_available: null,
    age_max: null,
    booking_instructions: null,
    prep_instructions: null,
    source_url: null,
    image_url: null,
    thumbnail_url: null,
    interest_status: null,
    interested_count: 0,
    interested_people: [],
    can_edit: false,
    submitted_by: null,
    source: null,
    ...overrides,
  }
}

function bucket(overrides: Partial<BreakBucket> = {}): BreakBucket {
  return {
    id: 'summer:week:1',
    break_id: 'summer',
    name: 'Summer Break',
    label: 'Week of Jun 8',
    start_date: '2026-06-08',
    end_date: '2026-06-14',
    is_weekly_bucket: true,
    camp_count: 1,
    camps: [camp()],
    ...overrides,
  }
}

describe('flattenAndDedupeCamps', () => {
  it('returns each camp once even when it appears in multiple buckets', () => {
    const multiWeekCamp = camp({ id: 'c1' })
    const buckets = [
      bucket({ id: 'week1', camps: [multiWeekCamp] }),
      bucket({ id: 'week2', camps: [multiWeekCamp] }),
      bucket({ id: 'week3', camps: [camp({ id: 'c2' })] }),
    ]
    const flattened = flattenAndDedupeCamps(buckets)
    expect(flattened.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('returns an empty list for empty buckets', () => {
    expect(flattenAndDedupeCamps([bucket({ camps: [] })])).toEqual([])
  })
})

describe('applyInterestUpdateAcrossBuckets', () => {
  it('updates every occurrence of a camp across every bucket it appears in', () => {
    const buckets = [
      bucket({ id: 'week1', camps: [camp({ id: 'c1', interest_status: null })] }),
      bucket({ id: 'week2', camps: [camp({ id: 'c1', interest_status: null })] }),
    ]
    const updated = applyInterestUpdateAcrossBuckets(buckets, 'c1', { interest_status: 'interested' })
    expect(updated[0].camps[0].interest_status).toBe('interested')
    expect(updated[1].camps[0].interest_status).toBe('interested')
  })

  it('leaves other camps in the same bucket untouched', () => {
    const buckets = [bucket({ camps: [camp({ id: 'c1' }), camp({ id: 'c2' })] })]
    const updated = applyInterestUpdateAcrossBuckets(buckets, 'c1', { interest_status: 'dismissed' })
    expect(updated[0].camps.find((c) => c.id === 'c2')?.interest_status).toBeNull()
  })
})
