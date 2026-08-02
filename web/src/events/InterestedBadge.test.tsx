import { describe, expect, it } from 'vitest'

import { buildInterestedTeaser } from './InterestedBadge'

describe('buildInterestedTeaser', () => {
  it('leads with the count rather than using the name as a sentence subject', () => {
    expect(buildInterestedTeaser(['You'], 1)).toBe('1 interested: You')
  })

  it('joins two names with "and"', () => {
    expect(buildInterestedTeaser(['You', 'Alice'], 2)).toBe('2 interested: You and Alice')
  })

  it('joins three names with a comma and a trailing "and"', () => {
    expect(buildInterestedTeaser(['You', 'Alice', 'Bob'], 3)).toBe('3 interested: You, Alice and Bob')
  })

  it('truncates with an ellipsis once names overflow the character budget', () => {
    const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace']
    expect(buildInterestedTeaser(names, names.length)).toBe('7 interested: Alice, Bob, Carol, Dave, Eve…')
  })

  it('falls back to a single name even if it alone overflows the budget', () => {
    expect(buildInterestedTeaser(['Alexandra Montgomery-Wentworth'], 1)).toBe('1 interested: Alexandra Montgomery-Wentworth')
  })
})
