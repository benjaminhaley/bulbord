import { describe, expect, it } from 'vitest'

import { buildInterestedTeaser, formatWhen, locationLabel, teaser } from './format'

describe('formatWhen', () => {
  const now = new Date('2026-08-02T09:00:00-05:00')

  it('labels an event happening today as "Today"', () => {
    expect(formatWhen({ startDate: '2026-08-02', startTime: null, allDay: true }, now)).toBe('Today')
  })

  it('labels tomorrow explicitly', () => {
    expect(formatWhen({ startDate: '2026-08-03', startTime: null, allDay: true }, now)).toBe('Tomorrow')
  })

  it('labels a day within the current week as "this <Weekday>"', () => {
    expect(formatWhen({ startDate: '2026-08-04', startTime: null, allDay: true }, now)).toBe('this Tuesday')
    expect(formatWhen({ startDate: '2026-08-08', startTime: null, allDay: true }, now)).toBe('this Saturday')
  })

  it('falls back to a weekday/month/day label a week or more out', () => {
    expect(formatWhen({ startDate: '2026-08-09', startTime: null, allDay: true }, now)).toBe('Sun, Aug 9')
  })

  it('appends a time for a timed, non-all-day event', () => {
    expect(formatWhen({ startDate: '2026-08-03', startTime: '18:30:00', allDay: false }, now)).toBe('Tomorrow · 6:30 pm')
  })

  it('omits the time for an all-day event even if start_time is set', () => {
    expect(formatWhen({ startDate: '2026-08-03', startTime: '18:30:00', allDay: true }, now)).toBe('Tomorrow')
  })

  it('omits minutes on the hour', () => {
    expect(formatWhen({ startDate: '2026-08-03', startTime: '09:00:00', allDay: false }, now)).toBe('Tomorrow · 9 am')
  })

  it('uses "noon" instead of "12 pm"', () => {
    expect(formatWhen({ startDate: '2026-08-03', startTime: '12:00:00', allDay: false }, now)).toBe('Tomorrow · noon')
  })

  it('uses "midnight" instead of "12 am"', () => {
    expect(formatWhen({ startDate: '2026-08-03', startTime: '00:00:00', allDay: false }, now)).toBe('Tomorrow · midnight')
  })
})

describe('locationLabel', () => {
  it('prefers location_name over the raw address', () => {
    expect(locationLabel({ locationName: 'Merlo Library', address: '123 Main St, Chicago, IL 60613' })).toBe('Merlo Library')
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

  it('returns short descriptions unchanged', () => {
    expect(teaser('short')).toBe('short')
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

  it('joins three names with a comma and a trailing "and"', () => {
    expect(buildInterestedTeaser(['You', 'Alice', 'Bob'], 3)).toBe('3 interested: You, Alice and Bob')
  })

  it('truncates with an ellipsis once names overflow the character budget', () => {
    const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace']
    expect(buildInterestedTeaser(names, names.length)).toBe('7 interested: Alice, Bob, Carol, Dave, Eve…')
  })

  it('falls back to a single name even if it alone overflows the budget', () => {
    expect(buildInterestedTeaser(['Alexandra Montgomery-Wentworth'], 1)).toBe('1 interested: Alexandra Montgomery-Wentworth')
  })
})
