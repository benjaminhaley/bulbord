import { describe, expect, it } from 'vitest'

import { computeSportsClubSort, sortSportsClubs, type SportsClubSortInput } from './sorting.js'

const TODAY = '2026-09-01'

function club(overrides: Partial<SportsClubSortInput> & { id: string }): SportsClubSortInput {
  return {
    scheduleType: 'fixed_session',
    firstDate: null,
    lastDate: null,
    nextOccurrenceDate: null,
    ...overrides,
  }
}

describe('computeSportsClubSort', () => {
  describe('fixed_session', () => {
    it('sorts by firstDate and is not hidden before it starts', () => {
      const result = computeSportsClubSort(
        club({ id: 'a', firstDate: '2026-09-15', lastDate: '2026-12-01', nextOccurrenceDate: '2026-09-15' }),
        TODAY,
      )
      expect(result).toEqual({ effectiveSortDate: '2026-09-15', hiddenByDefault: false, relevant: true })
    })

    it('is hidden by default once started, but still relevant (still running)', () => {
      const result = computeSportsClubSort(
        club({ id: 'a', firstDate: '2026-08-01', lastDate: '2026-12-01', nextOccurrenceDate: '2026-09-08' }),
        TODAY,
      )
      expect(result).toEqual({ effectiveSortDate: '2026-08-01', hiddenByDefault: true, relevant: true })
    })

    it('is excluded entirely once fully concluded (lastDate in the past)', () => {
      const result = computeSportsClubSort(
        club({ id: 'a', firstDate: '2026-06-01', lastDate: '2026-08-15', nextOccurrenceDate: null }),
        TODAY,
      )
      expect(result.relevant).toBe(false)
    })

    it('falls back to nextOccurrenceDate for sorting when firstDate is unknown', () => {
      const result = computeSportsClubSort(club({ id: 'a', firstDate: null, lastDate: '2026-12-01', nextOccurrenceDate: '2026-09-10' }), TODAY)
      expect(result.effectiveSortDate).toBe('2026-09-10')
      // hiddenByDefault requires a known firstDate — never true when it's unknown.
      expect(result.hiddenByDefault).toBe(false)
    })

    it('with no lastDate at all, stays relevant regardless of occurrences (a member self-service post has none)', () => {
      const withOccurrence = computeSportsClubSort(
        club({ id: 'a', firstDate: '2026-08-01', lastDate: null, nextOccurrenceDate: '2026-09-10' }),
        TODAY,
      )
      expect(withOccurrence.relevant).toBe(true)
      expect(withOccurrence.hiddenByDefault).toBe(true) // started (firstDate < today), still relevant

      const withoutOccurrence = computeSportsClubSort(
        club({ id: 'a', firstDate: '2026-08-01', lastDate: null, nextOccurrenceDate: null }),
        TODAY,
      )
      expect(withoutOccurrence.relevant).toBe(true)
      expect(withoutOccurrence.hiddenByDefault).toBe(true)
    })

    it('a self-service post with no dates at all stays relevant, sorting last', () => {
      const result = computeSportsClubSort(club({ id: 'a', firstDate: null, lastDate: null, nextOccurrenceDate: null }), TODAY)
      expect(result).toEqual({ effectiveSortDate: null, hiddenByDefault: false, relevant: true })
    })
  })

  describe('ongoing', () => {
    it('sorts by nextOccurrenceDate and is never hidden for being underway', () => {
      const result = computeSportsClubSort(
        club({ id: 'a', scheduleType: 'ongoing', firstDate: '2020-01-01', lastDate: null, nextOccurrenceDate: '2026-09-08' }),
        TODAY,
      )
      expect(result).toEqual({ effectiveSortDate: '2026-09-08', hiddenByDefault: false, relevant: true })
    })

    it('stays relevant even with no upcoming occurrence generated, sorting last', () => {
      const result = computeSportsClubSort(
        club({ id: 'a', scheduleType: 'ongoing', firstDate: '2020-01-01', lastDate: null, nextOccurrenceDate: null }),
        TODAY,
      )
      expect(result).toEqual({ effectiveSortDate: null, hiddenByDefault: false, relevant: true })
    })

    it('is excluded once its known lastDate has passed', () => {
      const result = computeSportsClubSort(
        club({ id: 'a', scheduleType: 'ongoing', firstDate: '2020-01-01', lastDate: '2026-08-15', nextOccurrenceDate: null }),
        TODAY,
      )
      expect(result.relevant).toBe(false)
    })

    it('an ongoing club with a lastDate in the future stays relevant regardless of nextOccurrenceDate', () => {
      const result = computeSportsClubSort(
        club({ id: 'a', scheduleType: 'ongoing', firstDate: '2020-01-01', lastDate: '2026-12-01', nextOccurrenceDate: null }),
        TODAY,
      )
      expect(result.relevant).toBe(true)
    })
  })
})

describe('sortSportsClubs', () => {
  it('excludes irrelevant clubs and sorts the rest by effectiveSortDate ascending', () => {
    const clubs = [
      club({ id: 'later-session', firstDate: '2026-10-01', lastDate: '2026-12-01', nextOccurrenceDate: '2026-10-01' }),
      club({ id: 'concluded', firstDate: '2026-06-01', lastDate: '2026-08-01', nextOccurrenceDate: null }),
      club({ id: 'ongoing-club', scheduleType: 'ongoing', nextOccurrenceDate: '2026-09-05', lastDate: null }),
      club({ id: 'sooner-session', firstDate: '2026-09-20', lastDate: '2026-12-01', nextOccurrenceDate: '2026-09-20' }),
    ]

    const result = sortSportsClubs(clubs, TODAY)

    expect(result.map((c) => c.id)).toEqual(['ongoing-club', 'sooner-session', 'later-session'])
  })

  it('sorts a club with no known date last, without crashing', () => {
    const clubs = [
      club({ id: 'has-date', firstDate: '2026-09-20', lastDate: '2026-12-01', nextOccurrenceDate: '2026-09-20' }),
      club({ id: 'no-date', scheduleType: 'ongoing', lastDate: '2026-12-01', nextOccurrenceDate: null }),
    ]

    const result = sortSportsClubs(clubs, TODAY)

    expect(result.map((c) => c.id)).toEqual(['has-date', 'no-date'])
  })

  it('annotates each surviving club with hiddenByDefault so the caller can build the reveal count', () => {
    const clubs = [
      club({ id: 'started', firstDate: '2026-08-01', lastDate: '2026-12-01', nextOccurrenceDate: '2026-09-08' }),
      club({ id: 'not-started', firstDate: '2026-09-20', lastDate: '2026-12-01', nextOccurrenceDate: '2026-09-20' }),
    ]

    const result = sortSportsClubs(clubs, TODAY)
    const hiddenCount = result.filter((c) => c.hiddenByDefault).length

    expect(hiddenCount).toBe(1)
    expect(result.find((c) => c.id === 'started')?.hiddenByDefault).toBe(true)
    expect(result.find((c) => c.id === 'not-started')?.hiddenByDefault).toBe(false)
  })
})
