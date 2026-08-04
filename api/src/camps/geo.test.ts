import { describe, expect, it } from 'vitest'

import { haversineMiles, NETTELHORST_COORDS } from './geo.js'

describe('haversineMiles', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng)).toBe(0)
  })

  it('matches the known ~69.1mi-per-degree-of-latitude constant', () => {
    // A pure latitude offset (same longitude) reduces to distance = R * dLat
    // in radians, independent of where on the globe it's centered — a good
    // sanity check that isn't just re-deriving the implementation.
    const distance = haversineMiles(41.0, -87.6, 41.1, -87.6)
    expect(distance).toBeCloseTo(6.91, 1)
  })

  it('is symmetric', () => {
    const a = haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, 41.88, -87.63)
    const b = haversineMiles(41.88, -87.63, NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng)
    expect(a).toBeCloseTo(b, 10)
  })

  it('places downtown Chicago within a plausible ~4-5mi of Nettelhorst', () => {
    // The Art Institute of Chicago (41.8796, -87.6237) — a real, known-distant
    // landmark, used only as an order-of-magnitude sanity check.
    const distance = haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, 41.8796, -87.6237)
    expect(distance).toBeGreaterThan(3)
    expect(distance).toBeLessThan(6)
  })
})
