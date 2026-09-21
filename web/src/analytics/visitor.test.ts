import { beforeEach, describe, expect, it } from 'vitest'

import { getVisitorId } from './visitor'

describe('getVisitorId', () => {
  beforeEach(() => localStorage.clear())

  it('creates a UUID once and returns the same one afterwards', () => {
    const first = getVisitorId()
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(getVisitorId()).toBe(first)
    expect(localStorage.getItem('bulbord_visitor_id')).toBe(first)
  })
})
