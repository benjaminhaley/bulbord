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
    expect(canDeleteEvent({ id: 'u1' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('denies everyone else, including admins', () => {
    expect(canDeleteEvent({ id: 'u2' }, { submittedByUserId: 'u1' })).toBe(false)
  })

  it('denies when the event has no recorded submitter (system-sourced)', () => {
    expect(canDeleteEvent({ id: 'u1' }, { submittedByUserId: null })).toBe(false)
  })
})
