import { describe, expect, it } from 'vitest'

import { findStaleBookingStatuses, type BookingStatusCampRow } from './booking-status-health.js'

function row(overrides: Partial<BookingStatusCampRow> = {}): BookingStatusCampRow {
  return {
    campId: 'camp-1',
    title: 'Some Provider',
    sourceId: 'src-1',
    sourceName: 'Some Provider',
    startDate: '2026-09-25',
    bookingStatus: 'not_opened',
    ...overrides,
  }
}

describe('findStaleBookingStatuses', () => {
  it('flags a not_opened camp starting within the warning window', () => {
    const result = findStaleBookingStatuses([row({ startDate: '2026-10-01' })], '2026-09-25')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ campId: 'camp-1', startDate: '2026-10-01', daysUntilStart: 6 })
  })

  it('does not flag a not_opened camp still far in the future', () => {
    // Genuinely too early to expect a real answer yet — matches feedback
    // #167/#168's own not_opened rows for dates months out.
    const result = findStaleBookingStatuses([row({ startDate: '2027-04-12' })], '2026-09-25')
    expect(result).toHaveLength(0)
  })

  it('does not flag a camp whose start date has already passed', () => {
    const result = findStaleBookingStatuses([row({ startDate: '2026-09-01' })], '2026-09-25')
    expect(result).toHaveLength(0)
  })

  it('never flags open, full, or waitlist camps, however close their date is', () => {
    const result = findStaleBookingStatuses(
      [
        row({ campId: 'a', bookingStatus: 'open', startDate: '2026-09-26' }),
        row({ campId: 'b', bookingStatus: 'full', startDate: '2026-09-26' }),
        row({ campId: 'c', bookingStatus: 'waitlist', startDate: '2026-09-26' }),
        row({ campId: 'd', bookingStatus: null, startDate: '2026-09-26' }),
      ],
      '2026-09-25',
    )
    expect(result).toHaveLength(0)
  })

  it('sorts soonest-starting first', () => {
    const result = findStaleBookingStatuses(
      [row({ campId: 'later', startDate: '2026-10-10' }), row({ campId: 'sooner', startDate: '2026-09-27' })],
      '2026-09-25',
    )
    expect(result.map((r) => r.campId)).toEqual(['sooner', 'later'])
  })
})
