import { describe, expect, it } from 'vitest'

import {
  ageRangeLabel,
  bookingStatusChipStyle,
  bookingStatusLabel,
  buildInterestedTeaser,
  campDetailsLine,
  distanceLabel,
  formatDateRange,
  locationLabel,
  optionAgeCell,
  optionPriceCell,
  optionTimeCell,
  priceLabel,
  sortOptionsByPrice,
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

  // Feedback #78: camps get the same "This <Weekday>" wording events do,
  // bounded to the current Sunday-Saturday calendar week (via the shared
  // ../dayLabel — see this file's own header comment).
  it('labels a single-day camp within the current week as "This <Weekday>"', () => {
    expect(formatDateRange('2026-08-04', '2026-08-04', now)).toBe('This Tuesday')
    expect(formatDateRange('2026-08-08', '2026-08-08', now)).toBe('This Saturday')
  })

  it('does not say "This <Weekday>" for a day in next calendar week even if only a few days out', () => {
    const friday = new Date('2026-08-07T09:00:00-05:00')
    expect(formatDateRange('2026-08-09', '2026-08-09', friday)).toBe('Sun, Aug 9')
  })

  it('falls back to a weekday/month/day label for a single-day camp further out', () => {
    expect(formatDateRange('2026-08-09', '2026-08-09', now)).toBe('Sun, Aug 9')
  })

  it('shows the actual date alongside the relative word in detailed mode', () => {
    expect(formatDateRange('2026-08-08', '2026-08-08', now, 'detailed')).toBe('This Saturday, Aug 8')
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
    expect(timeLabel('09:00:00', null)).toBe('9 am')
  })

  it('omits minutes on the hour but keeps them when non-zero, showing am/pm on both ends when they differ', () => {
    expect(timeLabel('09:00:00', '13:00:00')).toBe('9 am – 1 pm')
  })

  it('shows am/pm once, on the end only, when both ends share the same side', () => {
    expect(timeLabel('09:30:00', '11:00:00')).toBe('9:30 – 11 am')
  })

  it('uses "noon" instead of "12 pm", with no meridiem needed since the word implies it', () => {
    expect(timeLabel('12:00:00', '15:30:00')).toBe('noon – 3:30 pm')
  })

  it('uses "midnight" instead of "12 am"', () => {
    expect(timeLabel('00:00:00', '06:00:00')).toBe('midnight – 6 am')
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

describe('bookingStatusLabel', () => {
  it('labels each known status', () => {
    expect(bookingStatusLabel('open')).toBe('Booking: Open')
    expect(bookingStatusLabel('full')).toBe('Booking: Full')
    expect(bookingStatusLabel('waitlist')).toBe('Booking: Waitlist')
    expect(bookingStatusLabel('not_opened')).toBe('Booking: Not open yet')
  })

  it('shows Unknown for null or an unrecognized value, never omitting the label', () => {
    expect(bookingStatusLabel(null)).toBe('Booking: Unknown')
    expect(bookingStatusLabel('something_else')).toBe('Booking: Unknown')
  })
})

describe('bookingStatusChipStyle', () => {
  it('gives each known status its own muted background/foreground pair', () => {
    const open = bookingStatusChipStyle('open')
    const full = bookingStatusChipStyle('full')
    const waitlist = bookingStatusChipStyle('waitlist')
    const notOpened = bookingStatusChipStyle('not_opened')
    const all = [open, full, waitlist, notOpened]
    expect(new Set(all.map((c) => c.background)).size).toBe(4)
    expect(new Set(all.map((c) => c.color)).size).toBe(4)
  })

  it('falls back to the neutral gray pair for null or unrecognized values', () => {
    expect(bookingStatusChipStyle(null)).toEqual(bookingStatusChipStyle('not_opened'))
    expect(bookingStatusChipStyle('something_else')).toEqual(bookingStatusChipStyle('not_opened'))
  })
})

describe('campDetailsLine', () => {
  it('always joins price and age range — even when some are unknown — and omits spots when unknown', () => {
    expect(
      campDetailsLine({
        price_per_day: '70.00',
        price_is_estimated: false,
        age_min: 5,
        age_max: 13,
        spots_available: null,
      }),
    ).toBe('$70/day · Ages: 5-13')
  })

  it('includes spots once known, appended after the always-shown fields', () => {
    expect(
      campDetailsLine({
        price_per_day: '70.00',
        price_is_estimated: false,
        age_min: 5,
        age_max: 13,
        spots_available: 12,
      }),
    ).toBe('$70/day · Ages: 5-13 · Spots: 12 available')
  })

  it('shows explicit placeholders for every unknown field except spots, which is omitted', () => {
    expect(
      campDetailsLine({
        price_per_day: null,
        price_is_estimated: false,
        age_min: null,
        age_max: null,
        spots_available: null,
      }),
    ).toBe('Price: not published · Ages: not specified')
  })

  it('drops price and age when a camp has an Options table covering them instead, keeping spots', () => {
    expect(
      campDetailsLine(
        {
          price_per_day: '70.00',
          price_is_estimated: false,
          age_min: 5,
          age_max: 13,
          spots_available: 12,
        },
        { includePrice: false, includeAge: false },
      ),
    ).toBe('Spots: 12 available')
  })
})

describe('optionTimeCell', () => {
  it('shows a dash for an option with no fixed time', () => {
    expect(optionTimeCell(null, null)).toBe('—')
  })

  it('formats a range using the same house time style as timeLabel', () => {
    expect(optionTimeCell('09:00:00', '15:30:00')).toBe('9 am – 3:30 pm')
  })
})

describe('optionAgeCell', () => {
  it('shows a dash when no age override is set for this option', () => {
    expect(optionAgeCell(null, null)).toBe('—')
  })

  it('shows a range when set', () => {
    expect(optionAgeCell(7, 12)).toBe('7-12')
  })
})

describe('optionPriceCell', () => {
  it('shows a dash when this option has no fixed price', () => {
    expect(optionPriceCell(null)).toBe('—')
  })

  it('formats a whole-dollar amount with no decimals', () => {
    expect(optionPriceCell('120.00')).toBe('$120')
  })

  it('formats a fractional amount with two decimals', () => {
    expect(optionPriceCell('39.50')).toBe('$39.50')
  })
})

describe('sortOptionsByPrice', () => {
  it('orders options most-expensive-first', () => {
    const options = [{ price: '70.00' }, { price: '150.00' }, { price: '120.00' }]
    expect(sortOptionsByPrice(options).map((o) => o.price)).toEqual(['150.00', '120.00', '70.00'])
  })

  it('sorts an unpublished price to the end rather than treating it as free', () => {
    const options = [{ price: '65.00' }, { price: null }, { price: '95.00' }]
    expect(sortOptionsByPrice(options).map((o) => o.price)).toEqual(['95.00', '65.00', null])
  })

  it('does not mutate the input array', () => {
    const options = [{ price: '10.00' }, { price: '20.00' }]
    sortOptionsByPrice(options)
    expect(options.map((o) => o.price)).toEqual(['10.00', '20.00'])
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
