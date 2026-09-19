import { describe, expect, it } from 'vitest'

import { repeatOptionsFor, validRepeat } from './repeat'

describe('repeatOptionsFor', () => {
  it('offers nothing until a date is chosen', () => {
    expect(repeatOptionsFor('')).toEqual([])
  })

  it('offers 4th and last Sunday for 2026-09-27 (the book club)', () => {
    expect(repeatOptionsFor('2026-09-27').map((o) => o.label)).toEqual([
      'Every week on Sunday',
      'Every 2 weeks on Sunday',
      'Monthly on the 4th Sunday',
      'Monthly on the last Sunday',
    ])
  })

  it('does not offer "last" or a 5th ordinal for a mid-month date', () => {
    const values = repeatOptionsFor('2026-09-08').map((o) => o.value)
    expect(values).toContain('monthly_nth')
    expect(values).not.toContain('monthly_last')
  })

  it('offers only "last" (no ordinal) for a 5th weekday', () => {
    const values = repeatOptionsFor('2026-09-29').map((o) => o.value)
    expect(values).not.toContain('monthly_nth')
    expect(values).toContain('monthly_last')
  })
})

describe('validRepeat', () => {
  it('keeps a pattern that fits and drops one that does not', () => {
    expect(validRepeat('monthly_last', '2026-09-27')).toBe('monthly_last')
    expect(validRepeat('monthly_last', '2026-09-08')).toBe('')
    expect(validRepeat(undefined, '2026-09-27')).toBe('')
  })
})
