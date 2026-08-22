import { describe, expect, it } from 'vitest'

import { capitalizeWords } from './profileForm'

describe('capitalizeWords', () => {
  it('capitalizes the first letter of a single word', () => {
    expect(capitalizeWords('m')).toBe('M')
    expect(capitalizeWords('mary')).toBe('Mary')
  })

  it('capitalizes every word, not just the first', () => {
    expect(capitalizeWords('mary jane')).toBe('Mary Jane')
  })

  it('keeps capitalizing correctly as each word is typed letter by letter', () => {
    // Simulates onIonInput being called with the growing string on every
    // keystroke — the real bug this guards against: a whole-string-only
    // capitalize left the second word lowercase once a space was typed.
    const keystrokes = ['m', 'ma', 'mar', 'mary', 'mary ', 'mary j', 'mary ja']
    const results = keystrokes.map(capitalizeWords)
    expect(results).toEqual(['M', 'Ma', 'Mar', 'Mary', 'Mary ', 'Mary J', 'Mary Ja'])
  })

  it('leaves already-capitalized input unchanged', () => {
    expect(capitalizeWords('Mary Jane')).toBe('Mary Jane')
  })

  it('handles empty input', () => {
    expect(capitalizeWords('')).toBe('')
  })
})
