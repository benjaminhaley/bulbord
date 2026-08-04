import { describe, expect, it } from 'vitest'

import { canEditCamp } from './permissions.js'

describe('canEditCamp', () => {
  it('allows the submitter', () => {
    expect(canEditCamp({ id: 'u1' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('denies everyone else, including admins', () => {
    expect(canEditCamp({ id: 'u2' }, { submittedByUserId: 'u1' })).toBe(false)
  })

  it('denies when the camp has no recorded submitter (seeded/system camp)', () => {
    expect(canEditCamp({ id: 'u1' }, { submittedByUserId: null })).toBe(false)
  })
})
