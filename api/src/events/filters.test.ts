import { describe, expect, it } from 'vitest'

import { parseBeforeTimeParam, parseTopicsParam } from './filters.js'

describe('parseTopicsParam', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseTopicsParam('Movie Night, Sports & Fitness')).toEqual(['Movie Night', 'Sports & Fitness'])
  })

  it('drops empty segments', () => {
    expect(parseTopicsParam('Movie Night,,')).toEqual(['Movie Night'])
  })

  it('returns an empty array when unset', () => {
    expect(parseTopicsParam(undefined)).toEqual([])
  })
})

describe('parseBeforeTimeParam', () => {
  it('appends seconds to a valid HH:MM value', () => {
    expect(parseBeforeTimeParam('19:00')).toBe('19:00:00')
  })

  it('returns null when unset', () => {
    expect(parseBeforeTimeParam(undefined)).toBeNull()
  })

  it('returns null for a malformed value', () => {
    expect(parseBeforeTimeParam('not-a-time')).toBeNull()
    expect(parseBeforeTimeParam('7pm')).toBeNull()
  })
})
