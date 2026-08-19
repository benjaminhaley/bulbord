import { describe, expect, it } from 'vitest'

import { defaultAgesForKids, matchesAgeFilter, permissiveAgesForGrade } from './gradeAges'

describe('permissiveAgesForGrade', () => {
  it('matches the documented 2nd-grade example exactly', () => {
    expect(permissiveAgesForGrade('2')).toEqual([7, 8])
  })

  it('covers every grade with a two-age permissive range', () => {
    for (const grade of ['pre-k', 'k', '1', '2', '3', '4', '5', '6', '7', '8'] as const) {
      const ages = permissiveAgesForGrade(grade)
      expect(ages).toHaveLength(2)
      expect(ages[1]).toBe(ages[0] + 1)
    }
  })
})

describe('defaultAgesForKids', () => {
  it('returns empty for no kids', () => {
    expect(defaultAgesForKids([])).toEqual([])
  })

  it('returns one grade\'s permissive ages for a single kid', () => {
    expect(defaultAgesForKids([{ grade: '2' }])).toEqual([7, 8])
  })

  it('unions and dedupes across multiple kids in different grades', () => {
    expect(defaultAgesForKids([{ grade: 'k' }, { grade: '2' }])).toEqual([5, 6, 7, 8])
  })

  it('dedupes overlapping ranges from adjacent grades', () => {
    // 1st grade -> [6,7], 2nd grade -> [7,8]: 7 should appear once.
    expect(defaultAgesForKids([{ grade: '1' }, { grade: '2' }])).toEqual([6, 7, 8])
  })
})

describe('matchesAgeFilter', () => {
  it('matches everything when no age is selected', () => {
    expect(matchesAgeFilter(5, 10, [])).toBe(true)
    expect(matchesAgeFilter(null, null, [])).toBe(true)
  })

  it('excludes a listing with no known age range once a filter is active (feedback, 2026-08-19)', () => {
    expect(matchesAgeFilter(null, null, [7, 8])).toBe(false)
  })

  it('matches when any selected age falls within a known range', () => {
    expect(matchesAgeFilter(5, 10, [7, 8])).toBe(true)
    expect(matchesAgeFilter(5, 10, [12])).toBe(false)
  })

  it('matches an open-ended minimum ("12+") against any selected age at or above it', () => {
    expect(matchesAgeFilter(12, null, [13])).toBe(true)
    expect(matchesAgeFilter(12, null, [10])).toBe(false)
  })

  it('matches an open-ended maximum ("up to 5") against any selected age at or below it', () => {
    expect(matchesAgeFilter(null, 5, [4])).toBe(true)
    expect(matchesAgeFilter(null, 5, [7])).toBe(false)
  })
})
