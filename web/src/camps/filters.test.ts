import { describe, expect, it } from 'vitest'

import { matchesCampAgeFilter } from './filters'

describe('matchesCampAgeFilter', () => {
  it('matches everything when no age is selected', () => {
    expect(matchesCampAgeFilter({ age_min: 5, age_max: 10 }, [])).toBe(true)
  })

  it('never excludes a camp with no known age range', () => {
    expect(matchesCampAgeFilter({ age_min: null, age_max: null }, [7, 8])).toBe(true)
  })

  it('matches when a selected age falls within the camp\'s known range', () => {
    expect(matchesCampAgeFilter({ age_min: 5, age_max: 12 }, [7, 8])).toBe(true)
    expect(matchesCampAgeFilter({ age_min: 5, age_max: 12 }, [13])).toBe(false)
  })
})
