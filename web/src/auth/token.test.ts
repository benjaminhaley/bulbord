import { describe, expect, it } from 'vitest'

import { parseSignInToken } from './token'

describe('parseSignInToken', () => {
  it('extracts the token from a full sign-in link', () => {
    expect(parseSignInToken('https://nettelhorst.bulbord.com/?signInToken=abc123')).toBe('abc123')
  })

  it('extracts the token from a link with other query params around it', () => {
    expect(parseSignInToken('https://nettelhorst.bulbord.com/events?foo=bar&signInToken=abc123&baz=qux')).toBe(
      'abc123',
    )
  })

  it('treats a bare token as itself', () => {
    expect(parseSignInToken('abc123')).toBe('abc123')
  })

  it('pulls the token out of a signInToken= fragment that is not a full URL', () => {
    expect(parseSignInToken('signInToken=abc123')).toBe('abc123')
  })

  it('trims surrounding whitespace', () => {
    expect(parseSignInToken('  abc123  ')).toBe('abc123')
  })

  it('returns null for empty input', () => {
    expect(parseSignInToken('')).toBeNull()
    expect(parseSignInToken('   ')).toBeNull()
  })
})
