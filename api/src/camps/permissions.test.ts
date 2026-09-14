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
    expect(canDeleteCamp({ id: 'u1', roles: [] }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('denies a non-submitter, non-admin member', () => {
    expect(canDeleteCamp({ id: 'u2', roles: [] }, { submittedByUserId: 'u1' })).toBe(false)
  })

  it('denies when the camp has no recorded submitter (seeded/system camp) and the viewer is not admin', () => {
    expect(canDeleteCamp({ id: 'u1', roles: [] }, { submittedByUserId: null })).toBe(false)
  })

  // feedback #164 (2026-09-14): admin override
  it('allows an admin even when they are not the submitter', () => {
    expect(canDeleteCamp({ id: 'u2', roles: ['admin'] }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('allows an admin to delete a seeded/system camp with no submitter', () => {
    expect(canDeleteCamp({ id: 'u2', roles: ['admin'] }, { submittedByUserId: null })).toBe(true)
  })
})
