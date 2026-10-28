import { describe, expect, it, vi } from 'vitest'

vi.mock('../db/client.js', () => ({ db: {} }))

import { seriesTitleKey } from './series.js'

describe('seriesTitleKey', () => {
  it('puts per-date title variants of one sourced series together (the real LEAP listings)', () => {
    const key = seriesTitleKey('LEAP: Learn, Explore, and Play')
    expect(key).toBe('leap learn explore and play')
    expect(seriesTitleKey('LEAP: Learn, Explore, and Play — Wednesday Series (Oct 21)')).toBe(key)
    expect(seriesTitleKey('LEAP: Learn, Explore, and Play — Stand-alone Class (Sat, Nov 7)')).toBe(key)
  })

  it('keeps a suffix that names a different thing, not a date or session', () => {
    expect(seriesTitleKey('Movie Night — Frozen')).not.toBe(seriesTitleKey('Movie Night — Moana'))
    expect(seriesTitleKey('Movie Night (Frozen)')).not.toBe(seriesTitleKey('Movie Night (Moana)'))
  })

  it('does not mistake a word that merely starts like a weekday for one', () => {
    expect(seriesTitleKey('Story Time — Monster Mash')).toBe('story time monster mash')
  })

  it('ignores case and punctuation', () => {
    expect(seriesTitleKey('Bike Bus!')).toBe(seriesTitleKey('bike bus'))
  })
})
