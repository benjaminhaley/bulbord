import { describe, expect, it } from 'vitest'

import { canDeleteFeedbackComment, canEditFeedbackComment } from './comment-permissions.js'

describe('canEditFeedbackComment', () => {
  it('allows the author', () => {
    expect(canEditFeedbackComment({ id: 'u1' }, { userId: 'u1' })).toBe(true)
  })

  it('denies everyone else, including admins', () => {
    expect(canEditFeedbackComment({ id: 'u2' }, { userId: 'u1' })).toBe(false)
  })
})

describe('canDeleteFeedbackComment', () => {
  it('allows the author', () => {
    expect(canDeleteFeedbackComment({ id: 'u1', roles: [] }, { userId: 'u1' })).toBe(true)
  })

  it('allows an admin who is not the author', () => {
    expect(canDeleteFeedbackComment({ id: 'u2', roles: ['admin'] }, { userId: 'u1' })).toBe(true)
  })

  it('denies a non-author, non-admin', () => {
    expect(canDeleteFeedbackComment({ id: 'u2', roles: [] }, { userId: 'u1' })).toBe(false)
  })
})
