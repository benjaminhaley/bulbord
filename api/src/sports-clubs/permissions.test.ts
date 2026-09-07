import { describe, expect, it } from 'vitest'

import { canDeleteSportsClub, canEditSportsClub } from './permissions.js'

describe('canEditSportsClub', () => {
  it('allows the submitter', () => {
    expect(canEditSportsClub({ id: 'u1' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('allows any other member, not just the submitter (feedback #141)', () => {
    expect(canEditSportsClub({ id: 'u2' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('allows editing a seeded/system row (no recorded submitter)', () => {
    expect(canEditSportsClub({ id: 'u1' }, { submittedByUserId: null })).toBe(true)
  })
})

describe('canDeleteSportsClub', () => {
  it('allows the submitter', () => {
    expect(canDeleteSportsClub({ id: 'u1' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('denies everyone else, including admins', () => {
    expect(canDeleteSportsClub({ id: 'u2' }, { submittedByUserId: 'u1' })).toBe(false)
  })

  it('denies when the sports club has no recorded submitter (seeded/system row)', () => {
    expect(canDeleteSportsClub({ id: 'u1' }, { submittedByUserId: null })).toBe(false)
  })
})
