import { describe, expect, it, vi } from 'vitest'

import { validateProfileUpdate } from './service.js'

// validateProfileUpdate is a pure function, but service.ts also imports
// db/client.js at module scope (like every other feature module) — mocked
// here purely so importing the module under test doesn't require a real
// DATABASE_URL, same as auth/webauthn-verify.test.ts.
vi.mock('../db/client.js', () => ({ db: {} }))

describe('validateProfileUpdate', () => {
  it('requires email the first time a profile is completed', () => {
    const result = validateProfileUpdate({ profileComplete: false }, { name: 'Ben Haley' })
    expect(result).toEqual({ ok: false, message: 'email is required to complete your profile' })
  })

  it('accepts a name+email pair that completes the profile', () => {
    const result = validateProfileUpdate({ profileComplete: false }, { name: 'Ben Haley', email: 'ben@example.com' })
    expect(result).toEqual({ ok: true, updates: { name: 'Ben Haley', email: 'ben@example.com', avatarUrl: undefined } })
  })

  it('rejects a malformed email', () => {
    const result = validateProfileUpdate({ profileComplete: false }, { name: 'Ben Haley', email: 'not-an-email' })
    expect(result).toEqual({ ok: false, message: 'email must be a valid email address' })
  })

  it('rejects a blank name', () => {
    const result = validateProfileUpdate({ profileComplete: true }, { name: '   ' })
    expect(result).toEqual({ ok: false, message: 'name cannot be blank' })
  })

  it('rejects a blank email when email is explicitly being set', () => {
    const result = validateProfileUpdate({ profileComplete: true }, { email: '   ' })
    expect(result).toEqual({ ok: false, message: 'email cannot be blank' })
  })

  it('does not require email for a later edit once the profile is already complete', () => {
    const result = validateProfileUpdate({ profileComplete: true }, { name: 'New Name' })
    expect(result).toEqual({ ok: true, updates: { name: 'New Name', email: undefined, avatarUrl: undefined } })
  })

  it('allows an avatar-only update with no name or email', () => {
    const result = validateProfileUpdate({ profileComplete: true }, { avatarUrl: '/uploads/profiles/x.jpg' })
    expect(result).toEqual({ ok: true, updates: { name: undefined, email: undefined, avatarUrl: '/uploads/profiles/x.jpg' } })
  })
})
