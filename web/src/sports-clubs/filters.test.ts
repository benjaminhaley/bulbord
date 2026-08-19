import { describe, expect, it } from 'vitest'

import { matchesCategoryFilter, matchesScheduleFilter, matchesSportsClubAgeFilter, timeOfDayBucket } from './filters'

describe('matchesCategoryFilter', () => {
  it('matches everything when no category is selected', () => {
    expect(matchesCategoryFilter({ category: 'Dance' }, [])).toBe(true)
    expect(matchesCategoryFilter({ category: null }, [])).toBe(true)
  })

  it('matches only the selected categories', () => {
    expect(matchesCategoryFilter({ category: 'Dance' }, ['Dance'])).toBe(true)
    expect(matchesCategoryFilter({ category: 'Dance' }, ['Music'])).toBe(false)
    expect(matchesCategoryFilter({ category: 'Dance' }, ['Music', 'Dance'])).toBe(true)
  })

  it('falls a null category into "Other"', () => {
    expect(matchesCategoryFilter({ category: null }, ['Other'])).toBe(true)
    expect(matchesCategoryFilter({ category: null }, ['Dance'])).toBe(false)
  })
})

describe('timeOfDayBucket', () => {
  it('buckets before noon as morning', () => {
    expect(timeOfDayBucket('09:00:00')).toBe('morning')
    expect(timeOfDayBucket('11:59:00')).toBe('morning')
  })

  it('buckets noon through before 5pm as afternoon', () => {
    expect(timeOfDayBucket('12:00:00')).toBe('afternoon')
    expect(timeOfDayBucket('16:45:00')).toBe('afternoon')
  })

  it('buckets 5pm and later as evening', () => {
    expect(timeOfDayBucket('17:00:00')).toBe('evening')
    expect(timeOfDayBucket('20:30:00')).toBe('evening')
  })
})

describe('matchesScheduleFilter', () => {
  // 2026-08-20 is a Thursday.
  const thursdayMorning = { occurrences: [{ date: '2026-08-20', start_time: '09:00:00', end_time: '10:00:00', note: null }] }
  const thursdayNoTime = { occurrences: [{ date: '2026-08-20', start_time: null, end_time: null, note: null }] }
  const noOccurrences = { occurrences: [] }

  it('matches everything when no day or time is selected', () => {
    expect(matchesScheduleFilter(noOccurrences, [], [])).toBe(true)
    expect(matchesScheduleFilter(thursdayMorning, [], [])).toBe(true)
  })

  it('excludes a club with no occurrence data once a day or time filter is active (feedback #106)', () => {
    expect(matchesScheduleFilter(noOccurrences, [4], [])).toBe(false)
    expect(matchesScheduleFilter(noOccurrences, [], ['morning'])).toBe(false)
    expect(matchesScheduleFilter(noOccurrences, [4], ['morning'])).toBe(false)
  })

  it('filters by day of week using the real next occurrence', () => {
    expect(matchesScheduleFilter(thursdayMorning, [4], [])).toBe(true)
    expect(matchesScheduleFilter(thursdayMorning, [1], [])).toBe(false)
  })

  it('filters by time-of-day bucket using the real next occurrence', () => {
    expect(matchesScheduleFilter(thursdayMorning, [], ['morning'])).toBe(true)
    expect(matchesScheduleFilter(thursdayMorning, [], ['evening'])).toBe(false)
  })

  it('excludes on a time filter when the occurrence has no known time (feedback #106)', () => {
    expect(matchesScheduleFilter(thursdayNoTime, [], ['evening'])).toBe(false)
  })

  it('still matches a day-only filter when the occurrence has a known date but no known time', () => {
    expect(matchesScheduleFilter(thursdayNoTime, [4], [])).toBe(true)
  })

  it('combines day and time as AND, both must match', () => {
    expect(matchesScheduleFilter(thursdayMorning, [4], ['morning'])).toBe(true)
    expect(matchesScheduleFilter(thursdayMorning, [4], ['evening'])).toBe(false)
    expect(matchesScheduleFilter(thursdayMorning, [1], ['morning'])).toBe(false)
  })

  it('matches a class that meets on more than one weekday even when the soonest occurrence is a different day', () => {
    // A "Mon & Wed" class — 2026-08-24 (Mon) sorts before 2026-08-26 (Wed).
    const monAndWed = {
      occurrences: [
        { date: '2026-08-24', start_time: '17:00:00', end_time: '17:30:00', note: null },
        { date: '2026-08-26', start_time: '17:00:00', end_time: '17:30:00', note: null },
      ],
    }
    expect(matchesScheduleFilter(monAndWed, [3], [])).toBe(true) // Wednesday, not the soonest occurrence
    expect(matchesScheduleFilter(monAndWed, [2], [])).toBe(false) // Tuesday, meets neither day
  })

  it('checks time only against occurrences that already matched the day filter', () => {
    const tuesdayEveningAndSaturdayMorning = {
      occurrences: [
        { date: '2026-08-22', start_time: '09:00:00', end_time: '10:00:00', note: null }, // Saturday
        { date: '2026-08-25', start_time: '18:00:00', end_time: '19:00:00', note: null }, // Tuesday
      ],
    }
    // Filtering Tuesday + morning should not match on the Saturday morning occurrence.
    expect(matchesScheduleFilter(tuesdayEveningAndSaturdayMorning, [2], ['morning'])).toBe(false)
    expect(matchesScheduleFilter(tuesdayEveningAndSaturdayMorning, [2], ['evening'])).toBe(true)
  })
})

describe('matchesSportsClubAgeFilter', () => {
  it('matches everything when no age is selected', () => {
    expect(matchesSportsClubAgeFilter({ age_min: 5, age_max: 10 }, [])).toBe(true)
  })

  it('excludes a club with no known age range once a filter is active', () => {
    expect(matchesSportsClubAgeFilter({ age_min: null, age_max: null }, [7, 8])).toBe(false)
  })

  it('matches when a selected age falls within the known range', () => {
    expect(matchesSportsClubAgeFilter({ age_min: 5, age_max: 12 }, [7, 8])).toBe(true)
    expect(matchesSportsClubAgeFilter({ age_min: 5, age_max: 12 }, [13])).toBe(false)
  })
})
