import { describe, expect, it } from 'vitest'

import { canEditEvent } from './permissions.js'

describe('canEditEvent', () => {
  it('allows the submitter', () => {
    expect(canEditEvent({ id: 'u1' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('denies everyone else, including admins', () => {
    expect(canEditEvent({ id: 'u2' }, { submittedByUserId: 'u1' })).toBe(false)
  })

  it('denies when the event has no recorded submitter (system-sourced)', () => {
    expect(canEditEvent({ id: 'u1' }, { submittedByUserId: null })).toBe(false)
  })
})
