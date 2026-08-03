import { describe, expect, it } from 'vitest'

import { canEditFeedback } from './permissions.js'

describe('canEditFeedback', () => {
  it('allows the author', () => {
    expect(canEditFeedback({ id: 'u1' }, { createdByUserId: 'u1' })).toBe(true)
  })

  it('denies everyone else, including admins', () => {
    expect(canEditFeedback({ id: 'u2' }, { createdByUserId: 'u1' })).toBe(false)
  })

  it('denies when the post has no recorded author', () => {
    expect(canEditFeedback({ id: 'u1' }, { createdByUserId: null })).toBe(false)
  })
})
