import { describe, expect, it } from 'vitest'

import { formatRelativeDateTime, mapUrl, shortAddress } from './format'

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

describe('shortAddress', () => {
  it('strips a trailing "City, ST ZIP" suffix', () => {
    expect(shortAddress('3231 N Broadway, Chicago, IL 60657')).toBe('3231 N Broadway')
  })

  it('leaves an address with no recognizable suffix unchanged', () => {
    expect(shortAddress('Merlo Library')).toBe('Merlo Library')
  })
})

describe('mapUrl', () => {
  it('builds a Google Maps search URL from the full, untrimmed address', () => {
    expect(mapUrl('3231 N Broadway, Chicago, IL 60657')).toBe(
      'https://www.google.com/maps/search/?api=1&query=3231%20N%20Broadway%2C%20Chicago%2C%20IL%2060657',
    )
  })
})
