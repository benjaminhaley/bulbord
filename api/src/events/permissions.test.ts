import { describe, expect, it } from 'vitest'

import { canDeleteEvent, canEditEvent } from './permissions.js'

describe('canEditEvent', () => {
  it('allows the submitter', () => {
    expect(canEditEvent({ id: 'u1' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('allows any other member, not just the submitter (feedback #141)', () => {
    expect(canEditEvent({ id: 'u2' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('allows editing a system-sourced event (no recorded submitter)', () => {
    expect(canEditEvent({ id: 'u1' }, { submittedByUserId: null })).toBe(true)
  })
})

describe('canDeleteEvent', () => {
  it('allows the submitter', () => {
    expect(canDeleteEvent({ id: 'u1', roles: [] }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('denies a non-submitter, non-admin member', () => {
    expect(canDeleteEvent({ id: 'u2', roles: [] }, { submittedByUserId: 'u1' })).toBe(false)
  })

  it('denies when the event has no recorded submitter (system-sourced) and the viewer is not admin', () => {
    expect(canDeleteEvent({ id: 'u1', roles: [] }, { submittedByUserId: null })).toBe(false)
  })

  // feedback #164 (2026-09-14): admin override
  it('allows an admin even when they are not the submitter', () => {
    expect(canDeleteEvent({ id: 'u2', roles: ['admin'] }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('allows an admin to delete a system-sourced event with no submitter', () => {
    expect(canDeleteEvent({ id: 'u2', roles: ['admin'] }, { submittedByUserId: null })).toBe(true)
  })
})
