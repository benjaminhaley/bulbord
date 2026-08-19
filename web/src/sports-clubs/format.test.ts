import { describe, expect, it } from 'vitest'

import {
  ageRangeLabel,
  calendarEventForSportsClub,
  CATEGORY_OPTIONS,
  categoryLabel,
  distanceLabel,
  isLocationRedundantWithTitle,
  locationLabel,
  mapUrl,
  nextOccurrenceDayTimeLabel,
  occurrenceLabel,
  optionAgeCell,
  optionPriceCell,
  optionTimeCell,
  originalPriceLabel,
  priceLabel,
  scheduleSummary,
  shortAddress,
  signupStatusLabel,
  sportsClubDetailsLine,
} from './format'

describe('scheduleSummary', () => {
  it('shows "Ongoing — join anytime" for an ongoing listing, regardless of its dates', () => {
    expect(scheduleSummary({ schedule_type: 'ongoing', first_date: '2020-01-01', last_date: null })).toBe('Ongoing — join anytime')
  })

  it('shows a date range for a fixed_session with both dates known', () => {
    expect(scheduleSummary({ schedule_type: 'fixed_session', first_date: '2026-09-15', last_date: '2026-12-01' })).toBe(
      'Sep 15 – Dec 1',
    )
  })

  it('collapses to one date when first and last are the same (a single-day session)', () => {
    const now = new Date('2026-09-01T12:00:00')
    expect(scheduleSummary({ schedule_type: 'fixed_session', first_date: '2026-09-15', last_date: '2026-09-15' }, now)).toContain(
      'Sep 15',
    )
  })

  it('falls back to "Starts <date>" when only firstDate is known', () => {
    expect(scheduleSummary({ schedule_type: 'fixed_session', first_date: '2026-09-15', last_date: null })).toBe('Starts Sep 15')
  })

  it('falls back to "Through <date>" when only lastDate is known', () => {
    expect(scheduleSummary({ schedule_type: 'fixed_session', first_date: null, last_date: '2026-12-01' })).toBe('Through Dec 1')
  })

  it('shows "Schedule not specified" for a fixed_session with no dates at all', () => {
    expect(scheduleSummary({ schedule_type: 'fixed_session', first_date: null, last_date: null })).toBe('Schedule not specified')
  })
})

describe('priceLabel', () => {
  it('shows "Price: not published" when unknown', () => {
    expect(priceLabel(null)).toBe('Price: not published')
  })

  it('shows the standardized weekly figure with no hedge prefix, dropping the "Price:" label once known', () => {
    expect(priceLabel('45.00')).toBe('$45/week')
  })

  it('rounds a non-integer amount to the nearest whole dollar', () => {
    expect(priceLabel('12.50')).toBe('$13/week')
    expect(priceLabel('8.07')).toBe('$8/week')
    expect(priceLabel('1.43')).toBe('$1/week')
  })
})

describe('originalPriceLabel', () => {
  it('returns null when the real price is unknown', () => {
    expect(originalPriceLabel(null, null)).toBeNull()
  })

  it('shows the real published amount and unit, with no "~" and no /week suffix', () => {
    expect(originalPriceLabel('265.00', 'per session')).toBe('$265 per session')
  })

  it('omits the unit when none is given', () => {
    expect(originalPriceLabel('45.00', null)).toBe('$45')
  })
})

describe('ageRangeLabel', () => {
  it('shows "not specified" when both bounds are unknown', () => {
    expect(ageRangeLabel(null, null)).toBe('Ages: not specified')
  })

  it('shows a range when both bounds are known', () => {
    expect(ageRangeLabel(5, 12)).toBe('Ages: 5-12')
  })

  it('collapses to a single age when min equals max', () => {
    expect(ageRangeLabel(8, 8)).toBe('Ages: 8')
  })

  it('shows a "+" range when only a minimum is known', () => {
    expect(ageRangeLabel(5, null)).toBe('Ages: 5+')
  })

  it('shows an "up to" range when only a maximum is known', () => {
    expect(ageRangeLabel(null, 12)).toBe('Ages: up to 12')
  })
})

describe('signupStatusLabel', () => {
  it('always shows a label, even when unknown', () => {
    expect(signupStatusLabel(null)).toBe('Sign-up: Unknown')
    expect(signupStatusLabel('bogus')).toBe('Sign-up: Unknown')
  })

  it('labels every real status', () => {
    expect(signupStatusLabel('open')).toBe('Sign-up: Open')
    expect(signupStatusLabel('full')).toBe('Sign-up: Full')
    expect(signupStatusLabel('waitlist')).toBe('Sign-up: Waitlist')
    expect(signupStatusLabel('not_opened')).toBe('Sign-up: Not open yet')
  })
})

describe('distanceLabel', () => {
  it('shows "unknown" when null', () => {
    expect(distanceLabel(null)).toBe('Distance: unknown')
  })

  it('formats to one decimal place', () => {
    expect(distanceLabel('2.345')).toBe('2.3 mi')
  })
})

describe('occurrenceLabel', () => {
  it('shows just the date when no time is set', () => {
    expect(occurrenceLabel({ date: '2026-09-20', start_time: null, end_time: null, note: null })).not.toContain(':')
  })

  it('appends a formatted time range when present', () => {
    expect(occurrenceLabel({ date: '2026-09-20', start_time: '16:00:00', end_time: '17:00:00', note: null })).toContain('4 – 5 pm')
  })

  it('always uses the full weekday name, never a relative word or an abbreviation', () => {
    // A date that would otherwise read as "Today"/"This <Weekday>" via
    // dayLabel() must still show its real full weekday name here — the
    // whole point of this function is that every row in a multi-date list
    // reads as the same shape (feedback, 2026-08-18).
    const today = new Date().toISOString().slice(0, 10)
    const label = occurrenceLabel({ date: today, start_time: null, end_time: null, note: null })
    expect(label).not.toBe('Today')
    expect(label).not.toBe('Tomorrow')
    expect(label).toMatch(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), [A-Z][a-z]{2} \d{1,2}$/)
  })
})

describe('nextOccurrenceDayTimeLabel', () => {
  it('returns null when there are no occurrences yet', () => {
    expect(nextOccurrenceDayTimeLabel([])).toBeNull()
  })

  it('shows the pluralized weekday alone when no time is set', () => {
    // 2026-09-20 is a Sunday.
    expect(nextOccurrenceDayTimeLabel([{ date: '2026-09-20', start_time: null, end_time: null, note: null }])).toBe('Sundays')
  })

  it('shows the pluralized weekday plus a formatted time range', () => {
    // 2026-09-24 is a Thursday.
    expect(
      nextOccurrenceDayTimeLabel([{ date: '2026-09-24', start_time: '16:45:00', end_time: '17:45:00', note: null }]),
    ).toBe('Thursdays, 4:45 – 5:45 pm')
  })

  it('derives from only the first (soonest) occurrence, ignoring later ones', () => {
    expect(
      nextOccurrenceDayTimeLabel([
        { date: '2026-09-24', start_time: '16:45:00', end_time: null, note: null },
        { date: '2026-10-01', start_time: '09:00:00', end_time: null, note: null },
      ]),
    ).toBe('Thursdays, 4:45 pm')
  })
})

describe('categoryLabel', () => {
  it('prepends a relevant emoji for every real category option', () => {
    for (const category of CATEGORY_OPTIONS) {
      const label = categoryLabel(category)
      expect(label).not.toBe(category)
      expect(label.endsWith(category)).toBe(true)
    }
  })

  it('falls back to the bare string for an unrecognized category', () => {
    expect(categoryLabel('Something Unmapped')).toBe('Something Unmapped')
  })
})

describe('sportsClubDetailsLine', () => {
  it('joins the standardized weekly price and age, in that order', () => {
    expect(sportsClubDetailsLine({ price_per_week: '45.00', age_min: 5, age_max: 12 })).toBe('$45/week · Ages: 5-12')
  })

  it('suppresses price and/or age when a real options table makes them redundant', () => {
    const club = { price_per_week: '45.00', age_min: 5, age_max: 12 }
    expect(sportsClubDetailsLine(club, { includePrice: false, includeAge: false })).toBe('')
    expect(sportsClubDetailsLine(club, { includePrice: false })).toBe('Ages: 5-12')
    expect(sportsClubDetailsLine(club, { includeAge: false })).toBe('$45/week')
  })
})

describe('option cell formatters', () => {
  it('optionTimeCell shows a dash when unknown, a formatted range otherwise', () => {
    expect(optionTimeCell(null, null)).toBe('—')
    expect(optionTimeCell('16:45:00', '17:45:00')).toBe('4:45 – 5:45 pm')
  })

  it('optionAgeCell mirrors ageRangeLabel without the "Ages:" prefix', () => {
    expect(optionAgeCell(null, null)).toBe('—')
    expect(optionAgeCell(8, 15)).toBe('8-15')
    expect(optionAgeCell(8, 8)).toBe('8')
  })

  it('optionPriceCell shows the total alone when price_unit has no week count to derive a weekly rate from', () => {
    expect(optionPriceCell(null, null)).toBe('—')
    expect(optionPriceCell('45.00', 'per class')).toBe('$45 per class')
  })

  it('optionPriceCell shows a weekly rate plus the real total, dropping the week-count prose, when price_unit states one', () => {
    expect(optionPriceCell('475.00', 'per 15-week series')).toBe('$32/wk · $475')
    expect(optionPriceCell('221.00', 'per 8-week session')).toBe('$28/wk · $221')
  })
})

describe('calendarEventForSportsClub', () => {
  const base = {
    title: 'Kids Clay Room — Handbuilding',
    description: 'Slab, coil, and pinch handbuilding pottery techniques.',
    location_name: null,
    address: '2646 N Halsted St, Chicago, IL 60614',
    first_date: '2026-09-14',
    last_date: '2026-10-26',
  }

  it('uses the real next occurrence as a timed event when one exists', () => {
    const event = calendarEventForSportsClub({
      ...base,
      occurrences: [{ date: '2026-09-14', start_time: '16:30:00', end_time: '17:45:00', note: null }],
    })
    expect(event).toEqual({
      title: base.title,
      description: base.description,
      location: base.address,
      startDate: '2026-09-14',
      startTime: '16:30:00',
      endTime: '17:45:00',
      allDay: false,
    })
  })

  it('falls back to the first/last date as an all-day span when no occurrences exist', () => {
    const event = calendarEventForSportsClub({ ...base, occurrences: [] })
    expect(event).toEqual({
      title: base.title,
      description: base.description,
      location: base.address,
      startDate: '2026-09-14',
      endDate: '2026-10-26',
      allDay: true,
    })
  })

  it('returns null when there is nothing concrete to add (ongoing, no dates, no occurrences)', () => {
    const event = calendarEventForSportsClub({ ...base, first_date: null, last_date: null, occurrences: [] })
    expect(event).toBeNull()
  })

  it('prefers location_name over the raw address', () => {
    const event = calendarEventForSportsClub({
      ...base,
      location_name: 'Kids Clay Room',
      occurrences: [{ date: '2026-09-14', start_time: null, end_time: null, note: null }],
    })
    expect(event?.location).toBe('Kids Clay Room')
    expect(event?.allDay).toBe(true)
  })
})

describe('locationLabel / shortAddress / mapUrl', () => {
  it('prefers a location name over the raw address', () => {
    expect(locationLabel({ locationName: 'Dance on Broadway', address: '123 Main St, Chicago, IL 60613' })).toBe(
      'Dance on Broadway',
    )
  })

  it('strips city/state/zip from the address when no location name is set', () => {
    expect(locationLabel({ locationName: null, address: '123 Main St, Chicago, IL 60613' })).toBe('123 Main St')
    expect(shortAddress('123 Main St, Chicago, IL 60613')).toBe('123 Main St')
  })

  it('builds a Google Maps search URL from the full untrimmed address', () => {
    expect(mapUrl('123 Main St, Chicago, IL 60613')).toBe(
      'https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Chicago%2C%20IL%2060613',
    )
  })
})

describe('isLocationRedundantWithTitle', () => {
  it('flags a location name that is the title\'s own prefix', () => {
    expect(isLocationRedundantWithTitle('Dance on Broadway — Lovebug Tots', 'Dance on Broadway')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isLocationRedundantWithTitle('dance on broadway — Lovebug Tots', 'Dance on Broadway')).toBe(true)
  })

  it('is false when the location name is genuinely distinct from the title', () => {
    expect(isLocationRedundantWithTitle('Chicago Park District — Basketball', 'Gill Park')).toBe(false)
  })

  it('is false when there is no location name', () => {
    expect(isLocationRedundantWithTitle('Chicago Park District — Basketball', null)).toBe(false)
  })
})
