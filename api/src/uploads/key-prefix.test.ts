import { describe, expect, it } from 'vitest'

import { uploadsKeyPrefix } from './key-prefix.js'

describe('uploadsKeyPrefix', () => {
  it('uses prod/ in production', () => {
    expect(uploadsKeyPrefix({ NODE_ENV: 'production', UPLOADS_KEY_PREFIX: 'prod/' })).toBe('prod/')
  })

  it('uses dev/ outside production', () => {
    expect(uploadsKeyPrefix({ UPLOADS_KEY_PREFIX: 'dev/' })).toBe('dev/')
    expect(uploadsKeyPrefix({ NODE_ENV: 'development', UPLOADS_KEY_PREFIX: 'dev/' })).toBe('dev/')
  })

  it('refuses a missing or empty prefix', () => {
    expect(() => uploadsKeyPrefix({ NODE_ENV: 'production' })).toThrow(/must be "prod\/"/)
    expect(() => uploadsKeyPrefix({ NODE_ENV: 'production', UPLOADS_KEY_PREFIX: '' })).toThrow(/must be "prod\/"/)
    expect(() => uploadsKeyPrefix({})).toThrow(/must be "dev\/"/)
  })

  it('refuses the other environment’s folder', () => {
    expect(() => uploadsKeyPrefix({ NODE_ENV: 'production', UPLOADS_KEY_PREFIX: 'dev/' })).toThrow(/in production/)
    expect(() => uploadsKeyPrefix({ UPLOADS_KEY_PREFIX: 'prod/' })).toThrow(/outside production/)
  })
})
