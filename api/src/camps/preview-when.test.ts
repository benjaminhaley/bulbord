import { describe, expect, it } from 'vitest'

import { formatCampWhen } from './preview-when.js'

describe('formatCampWhen', () => {
  const now = new Date('2026-08-13T09:00:00-05:00')

  it('labels a single-day camp within the week as "This <Weekday>"', () => {
    expect(formatCampWhen({ startDate: '2026-08-15', endDate: '2026-08-15', startTime: null, endTime: null }, now)).toBe(
      'This Saturday',
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
