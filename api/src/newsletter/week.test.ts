import { describe, expect, it } from 'vitest'

import { getUpcomingWeekRange } from './week.js'

describe('getUpcomingWeekRange', () => {
  it('resolves to the next Monday–Sunday when run Sunday night (the scheduled cron time)', () => {
    // 2026-08-02 is a Sunday; the newsletter covers the week starting the
    // next day.
    const result = getUpcomingWeekRange(new Date('2026-08-02T20:00:00-05:00'))
    expect(result).toEqual({ monday: '2026-08-03', sunday: '2026-08-09' })
  })

  it('treats a Monday run as the start of that same week, not a week ahead', () => {
    const result = getUpcomingWeekRange(new Date('2026-08-03T09:00:00-05:00'))
    expect(result).toEqual({ monday: '2026-08-03', sunday: '2026-08-09' })
  })

  it('rolls a mid-week run forward to the next Monday', () => {
    // 2026-08-05 is a Wednesday.
    const result = getUpcomingWeekRange(new Date('2026-08-05T12:00:00-05:00'))
    expect(result).toEqual({ monday: '2026-08-10', sunday: '2026-08-16' })
  })

  it('rolls forward correctly across a month boundary', () => {
    // 2026-07-31 is a Friday.
    const result = getUpcomingWeekRange(new Date('2026-07-31T18:00:00-05:00'))
    expect(result).toEqual({ monday: '2026-08-03', sunday: '2026-08-09' })
  })
})
