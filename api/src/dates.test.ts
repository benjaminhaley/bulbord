import { describe, expect, it } from 'vitest'

import { addDays } from './dates.js'

describe('addDays', () => {
  it('adds days within the same month', () => {
    expect(addDays('2026-08-19', 7)).toBe('2026-08-26')
  })

  it('rolls over a month boundary', () => {
    expect(addDays('2026-08-28', 7)).toBe('2026-09-04')
  })

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04')
  })

  it('supports zero days (no-op)', () => {
    expect(addDays('2026-08-19', 0)).toBe('2026-08-19')
  })
})
