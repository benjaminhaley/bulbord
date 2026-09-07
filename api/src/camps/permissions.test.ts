import { describe, expect, it } from 'vitest'

import { canDeleteCamp, canEditCamp } from './permissions.js'

describe('canEditCamp', () => {
  it('allows the submitter', () => {
    expect(canEditCamp({ id: 'u1' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('allows any other member, not just the submitter (feedback #141)', () => {
    expect(canEditCamp({ id: 'u2' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('allows editing a seeded/system camp (no recorded submitter)', () => {
    expect(canEditCamp({ id: 'u1' }, { submittedByUserId: null })).toBe(true)
  })
})

describe('canDeleteCamp', () => {
  it('allows the submitter', () => {
    expect(canDeleteCamp({ id: 'u1' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('denies everyone else, including admins', () => {
    expect(canDeleteCamp({ id: 'u2' }, { submittedByUserId: 'u1' })).toBe(false)
  })

  it('denies when the camp has no recorded submitter (seeded/system camp)', () => {
    expect(canDeleteCamp({ id: 'u1' }, { submittedByUserId: null })).toBe(false)
  })
})
