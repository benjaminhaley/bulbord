import { describe, expect, it } from 'vitest'

import { describeMissingFields } from './EventForm'

describe('describeMissingFields', () => {
  it('names the single missing field', () => {
    expect(describeMissingFields(['Address'])).toBe('Address is required to post.')
  })

  it('joins two missing fields with "and"', () => {
    expect(describeMissingFields(['Title', 'Address'])).toBe('Title and Address are required to post.')
  })

  it('joins three or more missing fields with commas and a trailing "and"', () => {
    expect(describeMissingFields(['Title', 'Address', 'Date'])).toBe('Title, Address and Date are required to post.')
  })
})
