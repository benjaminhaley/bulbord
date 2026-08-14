import { describe, expect, it } from 'vitest'

import { formatCampWhen, locationLabel } from './preview-when.js'

describe('formatCampWhen', () => {
  const now = new Date('2026-08-13T09:00:00-05:00')

  it('labels a single-day camp within the week as "This <Weekday>"', () => {
    expect(formatCampWhen({ startDate: '2026-08-15', endDate: '2026-08-15', startTime: null, endTime: null }, now)).toBe(
      'This Saturday',
    )
  })

  // Feedback #78: "This <Weekday>" is bounded to the current Sunday-Saturday
  // calendar week, not a fixed "2-6 days out" window.
  it('does not say "This <Weekday>" for a day in next calendar week even if only a few days out', () => {
    const friday = new Date('2026-08-14T09:00:00-05:00')
    expect(formatCampWhen({ startDate: '2026-08-16', endDate: '2026-08-16', startTime: null, endTime: null }, friday)).toBe(
      'Sun, Aug 16',
    )
  })

  it('appends a formatted time range when times are set', () => {
    expect(
      formatCampWhen({ startDate: '2026-08-15', endDate: '2026-08-15', startTime: '09:00:00', endTime: '15:30:00' }, now),
    ).toBe('This Saturday · 9 am – 3:30 pm')
  })

  it('omits the time entirely rather than showing "not specified"', () => {
    expect(formatCampWhen({ startDate: '2026-08-15', endDate: '2026-08-15', startTime: null, endTime: null }, now)).not.toMatch(
      /not specified/,
    )
  })

  it('shows a plain date range for a multi-day camp', () => {
    expect(
      formatCampWhen({ startDate: '2026-11-23', endDate: '2026-11-27', startTime: '07:00:00', endTime: '18:00:00' }, now),
    ).toBe('Nov 23 – Nov 27 · 7 am – 6 pm')
  })
})

describe('locationLabel', () => {
  it('prefers the venue name over the address', () => {
    expect(locationLabel({ locationName: 'Lake View YMCA', address: '3333 N Marshfield Ave, Chicago, IL 60657' })).toBe(
      'Lake View YMCA',
    )
  })

  it('falls back to the address, stripped of city/state/zip', () => {
    expect(locationLabel({ locationName: null, address: '3333 N Marshfield Ave, Chicago, IL 60657' })).toBe(
      '3333 N Marshfield Ave',
    )
  })

  it('returns null when neither is set', () => {
    expect(locationLabel({ locationName: null, address: null })).toBeNull()
  })
})
