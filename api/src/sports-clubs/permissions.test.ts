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
    expect(canDeleteSportsClub({ id: 'u1', roles: [] }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('denies a non-submitter, non-admin member', () => {
    expect(canDeleteSportsClub({ id: 'u2', roles: [] }, { submittedByUserId: 'u1' })).toBe(false)
  })

  it('denies when the sports club has no recorded submitter (seeded/system row) and the viewer is not admin', () => {
    expect(canDeleteSportsClub({ id: 'u1', roles: [] }, { submittedByUserId: null })).toBe(false)
  })

  // feedback #164 (2026-09-14): admin override
  it('allows an admin even when they are not the submitter', () => {
    expect(canDeleteSportsClub({ id: 'u2', roles: ['admin'] }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('allows an admin to delete a seeded/system row with no submitter', () => {
    expect(canDeleteSportsClub({ id: 'u2', roles: ['admin'] }, { submittedByUserId: null })).toBe(true)
  })
})
