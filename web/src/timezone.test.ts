import { describe, expect, it } from 'vitest'

import { chicagoWallClockToInstantMs, instantToUtcParts, localizeWallClock } from './timezone'

describe('timezone', () => {
  it('converts Chicago summer (CDT) wall-clock to UTC', () => {
    expect(instantToUtcParts(chicagoWallClockToInstantMs('2026-09-25', '08:00:00'))).toEqual({ date: '2026-09-25', time: '13:00:00' })
  })
  it('converts Chicago winter (CST) wall-clock to UTC', () => {
    expect(instantToUtcParts(chicagoWallClockToInstantMs('2026-12-05', '08:00:00'))).toEqual({ date: '2026-12-05', time: '14:00:00' })
  })
  it('leaves a Chicago viewer unchanged', () => {
    expect(localizeWallClock('2026-09-25', '08:00:00', '09:30:00', 'America/Chicago')).toEqual({ date: '2026-09-25', startTime: '08:00:00', endTime: '09:30:00' })
  })
  it('shifts for another zone, including a date rollover', () => {
    expect(localizeWallClock('2026-09-25', '08:00:00', null, 'America/Denver')).toEqual({ date: '2026-09-25', startTime: '07:00:00', endTime: null })
    expect(localizeWallClock('2026-09-25', '22:00:00', null, 'Europe/London')).toEqual({ date: '2026-09-26', startTime: '04:00:00', endTime: null })
  })
  it('does not touch an all-day (no time) entry', () => {
    expect(localizeWallClock('2026-09-25', null, null, 'Asia/Tokyo')).toEqual({ date: '2026-09-25', startTime: null, endTime: null })
  })
})
