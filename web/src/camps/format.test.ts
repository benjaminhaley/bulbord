import { describe, expect, it } from 'vitest'

import {
  ageRangeLabel,
  buildInterestedTeaser,
  campDetailsLine,
  distanceLabel,
  formatDateRange,
  locationLabel,
  priceLabel,
  spotsLabel,
  timeLabel,
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
  it('flags an unspecified age range explicitly rather than omitting it', () => {
    expect(ageRangeLabel(null, null)).toBe('Ages: not specified')
  })

  it('shows a single age when min equals max', () => {
    expect(ageRangeLabel(6, 6)).toBe('Ages: 6')
  })

  it('shows a range when both bounds are set and differ', () => {
    expect(ageRangeLabel(5, 12)).toBe('Ages: 5-12')
  })

  it('shows an open-ended range when only the minimum is set', () => {
    expect(ageRangeLabel(8, null)).toBe('Ages: 8+')
  })

  it('shows an upper bound only when only the maximum is set', () => {
    expect(ageRangeLabel(null, 10)).toBe('Ages: up to 10')
  })
})

describe('priceLabel', () => {
  it('flags an unpublished price explicitly rather than omitting it', () => {
    expect(priceLabel(null)).toBe('Price: not published')
  })

  it('drops the redundant "Price:" label once a dollar amount is known', () => {
    expect(priceLabel('45.00')).toBe('$45/day')
  })

  it('formats a fractional price with two decimals', () => {
    expect(priceLabel('39.50')).toBe('$39.50/day')
  })

  it('flags an inferred price as estimated rather than showing it as confirmed', () => {
    expect(priceLabel('70.00', true)).toBe('$70/day (estimated)')
  })
})

describe('timeLabel', () => {
  it('flags unspecified hours explicitly rather than omitting the line', () => {
    expect(timeLabel(null, null)).toBe('Time: not specified')
  })

  it('drops the redundant "Time:" label once a real time is known, showing just a start time when no end time is known', () => {
    expect(timeLabel('09:00:00', null)).toBe('9:00 AM')
  })

  it('formats a full start-to-end range with no label', () => {
    expect(timeLabel('09:00:00', '17:30:00')).toBe('9:00 AM – 5:30 PM')
  })

  it('formats midday and midnight-adjacent times correctly', () => {
    expect(timeLabel('12:00:00', '13:00:00')).toBe('12:00 PM – 1:00 PM')
  })
})

describe('spotsLabel', () => {
  it('omits unknown availability rather than showing a distracting placeholder', () => {
    expect(spotsLabel(null)).toBe(null)
  })

  it('shows a count when known', () => {
    expect(spotsLabel(12)).toBe('Spots: 12 available')
  })

  it('shows full when zero or fewer', () => {
    expect(spotsLabel(0)).toBe('Spots: full')
  })
})

describe('campDetailsLine', () => {
  it('always joins price, age range, and distance — even when some are unknown — and omits spots when unknown', () => {
    expect(
      campDetailsLine({
        price_per_day: '70.00',
        price_is_estimated: false,
        age_min: 5,
        age_max: 13,
        distance_miles: '1.26',
        spots_available: null,
      }),
    ).toBe('$70/day · Ages: 5-13 · 1.3 mi')
  })

  it('includes spots once known, appended after the always-shown fields', () => {
    expect(
      campDetailsLine({
        price_per_day: '70.00',
        price_is_estimated: false,
        age_min: 5,
        age_max: 13,
        distance_miles: '1.26',
        spots_available: 12,
      }),
    ).toBe('$70/day · Ages: 5-13 · 1.3 mi · Spots: 12 available')
  })

  it('shows explicit placeholders for every unknown field except spots, which is omitted', () => {
    expect(
      campDetailsLine({
        price_per_day: null,
        price_is_estimated: false,
        age_min: null,
        age_max: null,
        distance_miles: null,
        spots_available: null,
      }),
    ).toBe('Price: not published · Ages: not specified · Distance: unknown')
  })
})

describe('distanceLabel', () => {
  it('flags unknown distance explicitly rather than omitting it', () => {
    expect(distanceLabel(null)).toBe('Distance: unknown')
  })

  it('drops the redundant "Distance:" label once a real distance is known', () => {
    expect(distanceLabel('2.34')).toBe('2.3 mi')
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

describe('buildInterestedTeaser', () => {
  it('leads with the count rather than using the name as a sentence subject', () => {
    expect(buildInterestedTeaser(['You'], 1)).toBe('1 interested: You')
  })

  it('joins two names with "and"', () => {
    expect(buildInterestedTeaser(['You', 'Alice'], 2)).toBe('2 interested: You and Alice')
  })
})
