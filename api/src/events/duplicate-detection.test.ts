import { describe, expect, it } from 'vitest'

import { findLikelyDuplicateEvent } from './duplicate-detection.js'

describe('findLikelyDuplicateEvent', () => {
  it('flags a generic-source title as a duplicate of a dedicated source\'s fuller title', () => {
    // The real 2026-09-04 incident: "Lowline Market" (a generic chamber
    // calendar scrape, no address) vs. "Low-Line Market at Southport" (the
    // market's own dedicated source, real address).
    const existing = [{ id: 'a', title: 'Low-Line Market at Southport', address: 'Southport Ave & Newport Ave, Chicago, IL' }]
    const dup = findLikelyDuplicateEvent({ title: 'Lowline Market', address: null }, existing)
    expect(dup?.id).toBe('a')
  })

  it('flags a short generic title as a duplicate of a fuller dedicated-source title', () => {
    const existing = [{ id: 'a', title: 'Southport Neighbors Yard Sale', address: 'Southport Corridor, Chicago, IL 60657' }]
    const dup = findLikelyDuplicateEvent({ title: 'Yard Sale', address: null }, existing)
    expect(dup?.id).toBe('a')
  })

  it('does not flag two different real events sharing only a generic template prefix', () => {
    // "Movie Night: X" and "Movie Night: Y" share two words but are
    // different occurrences with a different differentiator — a naive
    // word-overlap ratio would wrongly flag these as ~67% similar.
    const existing = [{ id: 'a', title: 'Movie Night: National Treasure', address: '3635 N Clark St, Chicago, IL' }]
    const dup = findLikelyDuplicateEvent({ title: 'Movie Night: Beethoven', address: '3635 N Clark St, Chicago, IL' }, existing)
    expect(dup).toBeNull()
  })

  it('does not flag genuinely distinct same-day, same-title listings at different real addresses', () => {
    // Chicago DOT's several real, distinct same-day block party permits —
    // same title, but each at its own confirmed address.
    const existing = [
      { id: 'a', title: 'Block Party', address: '1200 W Eddy St, Chicago, IL' },
      { id: 'b', title: 'Block Party', address: '2600 N Dayton St, Chicago, IL' },
    ]
    const dup = findLikelyDuplicateEvent({ title: 'Block Party', address: '1400 W Melrose St, Chicago, IL' }, existing)
    expect(dup).toBeNull()
  })

  it('flags an exact title+address match', () => {
    const existing = [{ id: 'a', title: 'Green City Market', address: '1817 N Clark St, Chicago, IL 60614' }]
    const dup = findLikelyDuplicateEvent({ title: 'Green City Market', address: '1817 N Clark St, Chicago, IL 60614' }, existing)
    expect(dup?.id).toBe('a')
  })

  it('does not flag two short, unrelated titles below the containment length floor', () => {
    const existing = [{ id: 'a', title: 'Karaoke', address: null }]
    const dup = findLikelyDuplicateEvent({ title: 'Trivia', address: null }, existing)
    expect(dup).toBeNull()
  })

  it('returns null when nothing on the same date matches', () => {
    const existing = [{ id: 'a', title: 'Green City Market', address: '1817 N Clark St, Chicago, IL 60614' }]
    const dup = findLikelyDuplicateEvent({ title: 'Curriculum Night', address: null }, existing)
    expect(dup).toBeNull()
  })
})
