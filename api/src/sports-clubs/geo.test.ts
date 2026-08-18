import { describe, expect, it } from 'vitest'

import { haversineMiles, NETTELHORST_COORDS } from './geo.js'

describe('haversineMiles', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng)).toBe(0)
  })

  it('matches the known ~69.1mi-per-degree-of-latitude constant', () => {
    const distance = haversineMiles(41.0, -87.6, 41.1, -87.6)
    expect(distance).toBeCloseTo(6.91, 1)
  })

  it('is symmetric', () => {
    const a = haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, 41.88, -87.63)
    const b = haversineMiles(41.88, -87.63, NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng)
    expect(a).toBeCloseTo(b, 10)
  })

  it('places downtown Chicago within a plausible ~4-5mi of Nettelhorst', () => {
    const distance = haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, 41.8796, -87.6237)
    expect(distance).toBeGreaterThan(3)
    expect(distance).toBeLessThan(6)
  })
})
