import { describe, expect, it } from 'vitest'

import {
  ageRangeLabel,
  buildInterestedTeaser,
  campDetailsLine,
  distanceLabel,
  formatDateRange,
  locationLabel,
  priceLabel,
  teaser,
} from './format'

describe('formatDateRange', () => {
  const now = new Date('2026-08-02T09:00:00-05:00')

  it('labels a single-day camp happening today as "Today"', () => {
    expect(formatDateRange('2026-08-02', '2026-08-02', now)).toBe('Today')
  })

  it('labels a single-day camp tomorrow explicitly', () => {
    expect(formatDateRange('2026-08-03', '2026-08-03', now)).toBe('Tomorrow')
  })

  it('falls back to a weekday/month/day label for a single-day camp further out', () => {
    expect(formatDateRange('2026-08-09', '2026-08-09', now)).toBe('Sun, Aug 9')
  })

  it('shows a plain date range for a multi-day camp', () => {
    expect(formatDateRange('2026-12-21', '2027-01-01', now)).toBe('Dec 21 – Jan 1')
  })
})

describe('ageRangeLabel', () => {
  it('returns null when neither bound is set', () => {
    expect(ageRangeLabel(null, null)).toBeNull()
  })

  it('shows a single age when min equals max', () => {
    expect(ageRangeLabel(6, 6)).toBe('Age 6')
  })

  it('shows a range when both bounds are set and differ', () => {
    expect(ageRangeLabel(5, 12)).toBe('Ages 5-12')
  })

  it('shows an open-ended range when only the minimum is set', () => {
    expect(ageRangeLabel(8, null)).toBe('Ages 8+')
  })

  it('shows an upper bound only when only the maximum is set', () => {
    expect(ageRangeLabel(null, 10)).toBe('Up to age 10')
  })
})

describe('priceLabel', () => {
  it('returns null for no price', () => {
    expect(priceLabel(null)).toBeNull()
  })

  it('formats a whole-dollar price without decimals', () => {
    expect(priceLabel('45.00')).toBe('$45/day')
  })

  it('formats a fractional price with two decimals', () => {
    expect(priceLabel('39.50')).toBe('$39.50/day')
  })

  it('flags an inferred price as estimated rather than showing it as confirmed', () => {
    expect(priceLabel('70.00', true)).toBe('$70/day (estimated)')
  })
})

describe('campDetailsLine', () => {
  it('joins price, age range, and distance with a middle dot', () => {
    expect(
      campDetailsLine({ price_per_day: '70.00', price_is_estimated: false, age_min: 5, age_max: 13, distance_miles: '1.26' }),
    ).toBe('$70/day · Ages 5-13 · 1.3 mi away')
  })

  it('flags an estimated price and omits missing fields', () => {
    expect(
      campDetailsLine({ price_per_day: '70.00', price_is_estimated: true, age_min: null, age_max: null, distance_miles: null }),
    ).toBe('$70/day (estimated)')
  })

  it('returns an empty string when nothing is known', () => {
    expect(campDetailsLine({ price_per_day: null, price_is_estimated: false, age_min: null, age_max: null, distance_miles: null })).toBe(
      '',
    )
  })
})

describe('distanceLabel', () => {
  it('returns null for no distance', () => {
    expect(distanceLabel(null)).toBeNull()
  })

  it('formats a distance to one decimal place', () => {
    expect(distanceLabel('2.34')).toBe('2.3 mi away')
  })
})

describe('locationLabel', () => {
  it('prefers location_name over the raw address', () => {
    expect(locationLabel({ locationName: 'YMCA Lakeview', address: '3333 N Marshfield Ave, Chicago, IL 60657' })).toBe(
      'YMCA Lakeview',
    )
  })

  it('strips a trailing City, ST ZIP from the address when there is no location_name', () => {
    expect(locationLabel({ locationName: null, address: '123 Main St, Chicago, IL 60613' })).toBe('123 Main St')
  })

  it('returns null when neither is present', () => {
    expect(locationLabel({ locationName: null, address: null })).toBeNull()
  })
})

describe('teaser', () => {
  it('returns null for no description', () => {
    expect(teaser(null)).toBeNull()
  })

  it('truncates long descriptions with a trailing ellipsis', () => {
    const long = 'x'.repeat(120)
    const result = teaser(long)
    expect(result).toHaveLength(91)
    expect(result?.endsWith('…')).toBe(true)
  })
})

describe('buildInterestedTeaser', () => {
  it('leads with the count rather than using the name as a sentence subject', () => {
    expect(buildInterestedTeaser(['You'], 1)).toBe('1 interested: You')
  })

  it('joins two names with "and"', () => {
    expect(buildInterestedTeaser(['You', 'Alice'], 2)).toBe('2 interested: You and Alice')
  })
})
