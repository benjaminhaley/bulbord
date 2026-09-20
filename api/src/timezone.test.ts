import { describe, expect, it } from 'vitest'

import { chicagoWallClock, timesFromChicagoWallClock, timesFromFields } from './timezone.js'

describe('timesFromChicagoWallClock', () => {
  it('converts a CDT wall-clock to UTC', () => {
    const t = timesFromChicagoWallClock({ date: '2026-09-25', startTime: '08:00:00', endTime: '09:30:00' })
    expect(t.startsAt.toISOString()).toBe('2026-09-25T13:00:00.000Z')
    expect(t.endsAt?.toISOString()).toBe('2026-09-25T14:30:00.000Z')
    expect(t.allDay).toBe(false)
  })
  it('converts a CST wall-clock to UTC', () => {
    expect(timesFromChicagoWallClock({ date: '2026-12-05', startTime: '08:00' }).startsAt.toISOString()).toBe('2026-12-05T14:00:00.000Z')
  })
  it('treats a missing time or all_day as a date-only Chicago-midnight entry', () => {
    const t = timesFromChicagoWallClock({ date: '2026-09-25', startTime: '08:00:00', allDay: true })
    expect(t).toEqual({ startsAt: new Date('2026-09-25T05:00:00.000Z'), endsAt: null, allDay: true })
    expect(timesFromChicagoWallClock({ date: '2026-09-25' }).allDay).toBe(true)
  })
})

describe('timesFromFields', () => {
  it('prefers real instants', () => {
    const t = timesFromFields({ starts_at: '2026-09-25T13:00:00Z', ends_at: '2026-09-25T14:00:00Z', all_day: false })
    expect(t?.startsAt.toISOString()).toBe('2026-09-25T13:00:00.000Z')
    expect(t?.endsAt?.toISOString()).toBe('2026-09-25T14:00:00.000Z')
  })
  it('date-only from an instant keeps the Chicago date', () => {
    // 2026-09-26 03:00Z is still the 25th in Chicago
    const t = timesFromFields({ starts_at: '2026-09-26T03:00:00Z', all_day: true })
    expect(chicagoWallClock(t!.startsAt).date).toBe('2026-09-25')
    expect(t?.allDay).toBe(true)
  })
  it('falls back to legacy Chicago wall-clock fields', () => {
    expect(timesFromFields({ start_date: '2026-09-25', start_time: '08:00:00' })?.startsAt.toISOString()).toBe('2026-09-25T13:00:00.000Z')
  })
  it('returns null for nothing usable or a bad instant', () => {
    expect(timesFromFields({})).toBeNull()
    expect(timesFromFields({ starts_at: 'nope' })).toBeNull()
  })
})
