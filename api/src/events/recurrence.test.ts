import { describe, expect, it } from 'vitest'

import { expandRecurrence, isLastWeekdayOfMonth, weekdayOrdinal } from './recurrence.js'

describe('expandRecurrence', () => {
  it('last Sunday monthly (the NYRB book club case) stays within a year', () => {
    const dates = expandRecurrence('2026-09-27', 'monthly_last')
    expect(dates.slice(0, 4)).toEqual(['2026-09-27', '2026-10-25', '2026-11-29', '2026-12-27'])
    expect(dates).toHaveLength(13)
    expect(dates[dates.length - 1]).toBe('2027-09-26')
  })

  it('weekly is capped at 20 occurrences', () => {
    const dates = expandRecurrence('2026-09-21', 'weekly')
    expect(dates).toHaveLength(20)
    expect(dates[1]).toBe('2026-09-28')
  })

  it('biweekly is capped at 20 occurrences, all within a year', () => {
    const dates = expandRecurrence('2026-09-21', 'biweekly')
    expect(dates).toHaveLength(20)
    expect(dates[19]).toBe('2027-06-14')
  })

  it('weekly never runs past one year when fewer than 20 fit', () => {
    expect(expandRecurrence('2026-09-21', 'weekly').every((d) => d <= '2027-09-21')).toBe(true)
  })

  it('monthly on the 2nd weekday keeps the ordinal', () => {
    expect(expandRecurrence('2026-09-08', 'monthly_nth').slice(0, 3)).toEqual(['2026-09-08', '2026-10-13', '2026-11-10'])
  })

  it('monthly on a 5th weekday skips months without one', () => {
    expect(expandRecurrence('2026-09-29', 'monthly_nth').slice(0, 3)).toEqual(['2026-09-29', '2026-12-29', '2027-03-30'])
  })

  it('crosses a year boundary correctly', () => {
    expect(expandRecurrence('2026-12-27', 'monthly_last').slice(0, 2)).toEqual(['2026-12-27', '2027-01-31'])
  })
})

describe('weekday helpers', () => {
  it('computes the ordinal and last-of-month', () => {
    expect(weekdayOrdinal('2026-09-27')).toBe(4)
    expect(isLastWeekdayOfMonth('2026-09-27')).toBe(true)
    expect(isLastWeekdayOfMonth('2026-09-20')).toBe(false)
  })
})
