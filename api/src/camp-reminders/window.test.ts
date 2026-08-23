import { describe, expect, it } from 'vitest'

import { isReminderDue, reminderDateFor } from './window.js'

describe('reminderDateFor', () => {
  it('is exactly 28 days before the break start', () => {
    expect(reminderDateFor('2026-09-25')).toBe('2026-08-28')
  })

  it('crosses a month boundary correctly', () => {
    expect(reminderDateFor('2026-01-04')).toBe('2025-12-07')
  })
})

describe('isReminderDue', () => {
  it('is not due more than 28 days before the break starts', () => {
    expect(isReminderDue('2026-08-27', '2026-09-25', null)).toBe(false)
  })

  it('is due exactly 28 days before the break starts', () => {
    expect(isReminderDue('2026-08-28', '2026-09-25', null)).toBe(true)
  })

  it('stays due on any later day too, so a missed cron run catches up', () => {
    expect(isReminderDue('2026-09-10', '2026-09-25', null)).toBe(true)
  })

  it('is never due again once remindedAt is set, no matter the date', () => {
    expect(isReminderDue('2026-09-10', '2026-09-25', new Date('2026-08-28T02:00:00Z'))).toBe(false)
  })
})
