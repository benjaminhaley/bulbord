import { describe, expect, it } from 'vitest'

import { canEditSportsClub } from './permissions.js'

describe('canEditSportsClub', () => {
  it('allows the submitter', () => {
    expect(canEditSportsClub({ id: 'u1' }, { submittedByUserId: 'u1' })).toBe(true)
  })

  it('denies everyone else, including admins', () => {
    expect(canEditSportsClub({ id: 'u2' }, { submittedByUserId: 'u1' })).toBe(false)
  })

  it('denies when the sports club has no recorded submitter (seeded/system row)', () => {
    expect(canEditSportsClub({ id: 'u1' }, { submittedByUserId: null })).toBe(false)
  })
})
