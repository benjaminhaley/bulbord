import { describe, expect, it } from 'vitest'

import { domainCheckedCell, sourceCheckedCell } from './sourceChecked'

const now = new Date('2026-09-27T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

describe('sourceCheckedCell', () => {
  it('is fine within 7 days', () => {
    expect(sourceCheckedCell({ is_active: true, last_checked_at: daysAgo(0.5) }, now)).toEqual({ label: 'today', stale: false })
    expect(sourceCheckedCell({ is_active: true, last_checked_at: daysAgo(4) }, now)).toEqual({ label: '4d', stale: false })
  })

  it('is red once older than 7 days, or never checked', () => {
    expect(sourceCheckedCell({ is_active: true, last_checked_at: daysAgo(8) }, now)).toEqual({ label: '8d', stale: true })
    expect(sourceCheckedCell({ is_active: true, last_checked_at: null }, now)).toEqual({ label: 'never', stale: true })
  })

  it('shows an inactive source as off, never red', () => {
    expect(sourceCheckedCell({ is_active: false, last_checked_at: daysAgo(40) }, now)).toEqual({ label: 'off', stale: false })
  })
})

describe('domainCheckedCell', () => {
  it('reports the least recently checked active source', () => {
    const cell = domainCheckedCell(
      [
        { is_active: true, last_checked_at: daysAgo(1) },
        { is_active: true, last_checked_at: daysAgo(9) },
        { is_active: false, last_checked_at: daysAgo(30) },
      ],
      now,
    )
    expect(cell).toEqual({ label: '9d', stale: true })
  })

  it('is never when any active source was never checked, off when none are active', () => {
    expect(domainCheckedCell([{ is_active: true, last_checked_at: daysAgo(1) }, { is_active: true, last_checked_at: null }], now)).toEqual({
      label: 'never',
      stale: true,
    })
    expect(domainCheckedCell([{ is_active: false, last_checked_at: null }], now)).toEqual({ label: 'off', stale: false })
  })
})
