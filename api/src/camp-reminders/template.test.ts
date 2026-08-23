import { describe, expect, it } from 'vitest'

import { campReminderSubject } from './template.js'

describe('campReminderSubject', () => {
  const now = new Date('2026-08-23T09:00:00-05:00')

  it('uses the same abbreviated date format an in-app camp row shows for a single-day break', () => {
    expect(campReminderSubject('2026-09-25', '2026-09-25', '', now)).toBe(
      'Nettelhorst closed Fri, Sep 25 – need a day off camp?',
    )
  })

  it('shows a plain abbreviated date range for a multi-day break', () => {
    expect(campReminderSubject('2026-12-21', '2027-01-01', '', now)).toBe(
      'Nettelhorst closed Dec 21 – Jan 1 – need day off camps?',
    )
  })

  it('prefixes a test send the same way the newsletter test-send does', () => {
    expect(campReminderSubject('2026-09-25', '2026-09-25', '[Test] ', now)).toBe(
      '[Test] Nettelhorst closed Fri, Sep 25 – need a day off camp?',
    )
  })

  it('still shows the actual date even when the break falls within the current calendar week', () => {
    // 2026-08-23 is a Sunday — "This Wednesday" alone would have no date to
    // anchor it in a standalone email with no surrounding list context, so
    // 'detailed' mode keeps the date attached even here (see template.ts's
    // own comment on why this differs from the per-camp rows' 'summary' mode).
    expect(campReminderSubject('2026-08-26', '2026-08-26', '', now)).toBe(
      'Nettelhorst closed This Wednesday, Aug 26 – need a day off camp?',
    )
  })
})
