import { describe, expect, it } from 'vitest'

import { splitName } from './EditProfilePage'

describe('splitName', () => {
  it('splits a normal two-word name', () => {
    expect(splitName('Ben Haley')).toEqual({ firstName: 'Ben', lastName: 'Haley' })
  })

  it('keeps a multi-word last name together', () => {
    expect(splitName('Anna Piepmeyer Haley')).toEqual({ firstName: 'Anna', lastName: 'Piepmeyer Haley' })
  })

  it('leaves lastName blank for a single-word name', () => {
    expect(splitName('Cher')).toEqual({ firstName: 'Cher', lastName: '' })
  })

  it('collapses extra whitespace', () => {
    expect(splitName('  Ben   Haley  ')).toEqual({ firstName: 'Ben', lastName: 'Haley' })
  })
})
