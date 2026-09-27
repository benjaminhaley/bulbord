import { describe, expect, it } from 'vitest'

import { type DataFreshness } from './api'
import { describeFreshnessAlert, freshnessAlertTargetPath, freshnessSignature } from './freshnessAlert'

function freshness(overrides: Partial<DataFreshness>): DataFreshness {
  return {
    events_last_checked_at: null,
    camps_last_updated_at: null,
    oldest_at: null,
    is_stale: false,
    ...overrides,
  }
}

describe('describeFreshnessAlert', () => {
  it('returns null when freshness is null or not stale', () => {
    expect(describeFreshnessAlert(null)).toBeNull()
    expect(describeFreshnessAlert(freshness({}))).toBeNull()
  })

  it('describes stale data', () => {
    expect(describeFreshnessAlert(freshness({ is_stale: true }))).toBe('Events/camps data needs a refresh — tap for details')
  })
})

// Feedback #140: "I don't get directed to anything actionable".
describe('freshnessAlertTargetPath', () => {
  it('points at bare dev-tools when nothing is flagged or freshness is null', () => {
    expect(freshnessAlertTargetPath(null)).toBe('/admin/dev-tools')
    expect(freshnessAlertTargetPath(freshness({}))).toBe('/admin/dev-tools')
  })

  it('points at the sourcing section when stale', () => {
    expect(freshnessAlertTargetPath(freshness({ is_stale: true }))).toBe('/admin/dev-tools#sourcing-and-data')
  })
})

// Follow-up to feedback #140 ("I clicked the alert and it didn't go away").
describe('freshnessSignature', () => {
  it('returns null when freshness itself is null', () => {
    expect(freshnessSignature(null)).toBeNull()
  })

  it('is stable for the exact same freshness content', () => {
    const a = freshnessSignature(freshness({ is_stale: true, oldest_at: '2026-09-01T00:00:00Z' }))
    const b = freshnessSignature(freshness({ is_stale: true, oldest_at: '2026-09-01T00:00:00Z' }))
    expect(a).toBe(b)
  })

  it('changes when is_stale flips', () => {
    expect(freshnessSignature(freshness({ is_stale: false }))).not.toBe(freshnessSignature(freshness({ is_stale: true })))
  })

  it('changes for a later, separate staleness episode', () => {
    const first = freshnessSignature(freshness({ is_stale: true, oldest_at: '2026-09-01T00:00:00Z' }))
    const later = freshnessSignature(freshness({ is_stale: true, oldest_at: '2026-09-20T00:00:00Z' }))
    expect(first).not.toBe(later)
  })
})
