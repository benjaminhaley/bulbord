import { describe, expect, it } from 'vitest'

import { formatRelativeDateTime } from './format'

describe('formatRelativeDateTime', () => {
  const now = new Date('2026-08-03T22:00:00')

  it('shows "Today at ..." for a timestamp earlier today', () => {
    expect(formatRelativeDateTime('2026-08-03T16:57:00', now)).toBe('Today at 4:57 PM')
  })

  it('shows "Yesterday" for a timestamp exactly one calendar day ago', () => {
    expect(formatRelativeDateTime('2026-08-02T09:00:00', now)).toBe('Yesterday')
  })

  it('falls back to the short-date style for anything older', () => {
    expect(formatRelativeDateTime('2026-05-26T09:00:00', now)).toBe('May 26, 2026')
  })
})
