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

  it('requires role the first time a profile is completed', () => {
    const result = validateProfileUpdate(
      { profileComplete: false },
      { name: 'Ben Haley', email: 'ben@example.com' },
    )
    expect(result).toEqual({ ok: false, message: 'role is required to complete your profile' })
  })

  it('rejects an invalid role value', () => {
    const result = validateProfileUpdate(
      { profileComplete: false },
      { name: 'Ben Haley', email: 'ben@example.com', role: 'teacher' as never },
    )
    expect(result).toEqual({ ok: false, message: 'role must be staff, family, or other' })
  })

  it('requires a roleOther description when role is other', () => {
    const result = validateProfileUpdate(
      { profileComplete: false },
      { name: 'Ben Haley', email: 'ben@example.com', role: 'other' },
    )
    expect(result).toEqual({ ok: false, message: 'please describe your role' })
  })

  it('accepts a name+email+role that completes the profile', () => {
    const result = validateProfileUpdate(
      { profileComplete: false },
      { name: 'Ben Haley', email: 'ben@example.com', role: 'family' },
    )
    expect(result).toEqual({
      ok: true,
      updates: { name: 'Ben Haley', email: 'ben@example.com', avatarUrl: undefined, role: 'family', roleOther: undefined },
    })
  })

  it('accepts role "other" with a description', () => {
    const result = validateProfileUpdate(
      { profileComplete: false },
      { name: 'Ben Haley', email: 'ben@example.com', role: 'other', roleOther: 'Neighbor' },
    )
    expect(result).toEqual({
      ok: true,
      updates: { name: 'Ben Haley', email: 'ben@example.com', avatarUrl: undefined, role: 'other', roleOther: 'Neighbor' },
    })
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

  it('passes newsletterSubscribed through, including an explicit opt-out', () => {
    const result = validateProfileUpdate(
      { profileComplete: false },
      { name: 'Ben Haley', email: 'ben@example.com', role: 'staff', newsletterSubscribed: false },
    )
    expect(result).toEqual({
      ok: true,
      updates: {
        name: 'Ben Haley',
        email: 'ben@example.com',
        avatarUrl: undefined,
        newsletterSubscribed: false,
        role: 'staff',
        roleOther: undefined,
      },
    })
  })
})
