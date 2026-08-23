import { describe, expect, it } from 'vitest'

import { campReminderSubject } from './template.js'

describe('campReminderSubject', () => {
  it('names the weekday for a single-day break, matching feedback #120\'s own example', () => {
    expect(campReminderSubject('2026-09-25', '2026-09-25')).toBe(
      'Nettelhorst closed on Friday, September 25 – do you need a day off camp?',
    )
  })

  it('shows a plain date range for a multi-day break', () => {
    expect(campReminderSubject('2026-12-21', '2027-01-01')).toBe(
      'Nettelhorst closed December 21 – January 1 – do you need day off camps?',
    )
  })

  it('prefixes a test send the same way the newsletter test-send does', () => {
    expect(campReminderSubject('2026-09-25', '2026-09-25', '[Test] ')).toBe(
      '[Test] Nettelhorst closed on Friday, September 25 – do you need a day off camp?',
    )
  })
})
