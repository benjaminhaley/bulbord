import { describe, expect, it } from 'vitest'

import { canDeleteComment, canEditComment } from './comment-permissions.js'

describe('canEditComment', () => {
  it('allows the author', () => {
    expect(canEditComment({ id: 'u1' }, { userId: 'u1' })).toBe(true)
  })

  it('denies everyone else, including admins', () => {
    expect(canEditComment({ id: 'u2' }, { userId: 'u1' })).toBe(false)
  })
})

describe('canDeleteComment', () => {
  it('allows the author', () => {
    expect(canDeleteComment({ id: 'u1', roles: [] }, { userId: 'u1' })).toBe(true)
  })

  it('allows an admin who is not the author', () => {
    expect(canDeleteComment({ id: 'u2', roles: ['admin'] }, { userId: 'u1' })).toBe(true)
  })

  it('denies a non-author, non-admin', () => {
    expect(canDeleteComment({ id: 'u2', roles: [] }, { userId: 'u1' })).toBe(false)
  })
})
