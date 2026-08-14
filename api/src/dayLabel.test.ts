import { describe, expect, it } from 'vitest'

import { dayLabel } from './dayLabel.js'

describe('dayLabel', () => {
  // Sunday, so this week spans 2026-08-02 (Sun) through 2026-08-08 (Sat).
  const sunday = new Date('2026-08-02T09:00:00-05:00')

  it('labels today as "Today"', () => {
    expect(dayLabel('2026-08-02', sunday)).toBe('Today')
  })

  it('labels tomorrow explicitly', () => {
    expect(dayLabel('2026-08-03', sunday)).toBe('Tomorrow')
  })

  it('labels a day within the current week as "This <Weekday>"', () => {
    expect(dayLabel('2026-08-04', sunday)).toBe('This Tuesday')
    expect(dayLabel('2026-08-08', sunday)).toBe('This Saturday')
  })

  it('falls back to a weekday/month/day label once the current week has passed', () => {
    expect(dayLabel('2026-08-09', sunday)).toBe('Sun, Aug 9')
  })

  // Feedback #78: the old "2-6 days out" heuristic didn't check calendar
  // week boundaries at all — from a Friday, 2 days out is already next
  // Sunday, but it would still have been labeled "This Sunday".
  it('does not say "This <Weekday>" for a day that is 2-6 days out but in next calendar week', () => {
    const friday = new Date('2026-08-07T09:00:00-05:00')
    expect(dayLabel('2026-08-09', friday)).toBe('Sun, Aug 9')
    expect(dayLabel('2026-08-10', friday)).toBe('Mon, Aug 10')
  })

  it('still says "This <Weekday>" for a day later in the same week', () => {
    const thursday = new Date('2026-08-06T09:00:00-05:00')
    expect(dayLabel('2026-08-08', thursday)).toBe('This Saturday')
  })

  describe('detailed mode', () => {
    it('appends the actual date after a relative word', () => {
      expect(dayLabel('2026-08-02', sunday, 'detailed')).toBe('Today, Aug 2')
      expect(dayLabel('2026-08-03', sunday, 'detailed')).toBe('Tomorrow, Aug 3')
      expect(dayLabel('2026-08-08', sunday, 'detailed')).toBe('This Saturday, Aug 8')
    })

    it('is unchanged from summary mode once there is no relative word to disambiguate', () => {
      expect(dayLabel('2026-08-09', sunday, 'detailed')).toBe('Sun, Aug 9')
    })
  })
})
