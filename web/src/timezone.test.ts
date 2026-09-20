import { describe, expect, it } from 'vitest'

import { chicagoWallClockToLocal, localizeWallClock, localTiming, localToInstantIso } from './timezone'
import { instantToWallClock, wallClockToInstantMs } from './timezone-core'

describe('timezone-core', () => {
  it('converts Chicago summer (CDT) wall-clock to UTC and back', () => {
    const ms = wallClockToInstantMs('2026-09-25', '08:00:00')
    expect(new Date(ms).toISOString()).toBe('2026-09-25T13:00:00.000Z')
    expect(instantToWallClock(ms, 'America/Chicago')).toEqual({ date: '2026-09-25', time: '08:00:00' })
  })
  it('converts Chicago winter (CST) wall-clock to UTC', () => {
    expect(new Date(wallClockToInstantMs('2026-12-05', '08:00:00')).toISOString()).toBe('2026-12-05T14:00:00.000Z')
  })
})

describe('localTiming', () => {
  const event = { starts_at: '2026-09-25T13:00:00.000Z', ends_at: '2026-09-25T14:30:00.000Z', start_date: '2026-09-25', start_time: '08:00:00', end_time: '09:30:00', all_day: false }
  it('leaves a Chicago viewer unchanged', () => {
    expect(localTiming(event, 'America/Chicago')).toEqual({ date: '2026-09-25', startTime: '08:00:00', endTime: '09:30:00', allDay: false })
  })
  it('shifts for another zone, including a date rollover', () => {
    expect(localTiming(event, 'America/Denver').startTime).toBe('07:00:00')
    expect(localTiming({ ...event, starts_at: '2026-09-26T03:00:00.000Z', ends_at: null }, 'Europe/London')).toMatchObject({ date: '2026-09-26', startTime: '04:00:00' })
  })
  it('does not shift an all-day entry', () => {
    expect(localTiming({ ...event, all_day: true }, 'Asia/Tokyo')).toEqual({ date: '2026-09-25', startTime: null, endTime: null, allDay: true })
  })
  it('falls back to Chicago wall-clock fields when there are no instants (legacy snapshots)', () => {
    expect(localTiming({ start_date: '2026-09-25', start_time: '08:00:00', end_time: null, all_day: false }, 'America/Denver').startTime).toBe('07:00:00')
  })
})

describe('form helpers', () => {
  it('turns viewer-local entry into an instant', () => {
    expect(localToInstantIso('2026-09-25', '08:00', 'America/Denver')).toBe('2026-09-25T14:00:00.000Z')
  })
  it('converts extracted Chicago wall-clock to the viewer local zone', () => {
    expect(chicagoWallClockToLocal('2026-09-25', '08:00', 'America/Denver')).toEqual({ date: '2026-09-25', time: '07:00' })
    expect(chicagoWallClockToLocal('2026-09-25', null)).toEqual({ date: '2026-09-25', time: null })
  })
  it("converts a camp's hours from the camp's own zone", () => {
    expect(localizeWallClock('2026-10-12', '09:00:00', '15:00:00', 'America/Chicago', 'America/New_York')).toEqual({ date: '2026-10-12', startTime: '10:00:00', endTime: '16:00:00' })
  })
})
