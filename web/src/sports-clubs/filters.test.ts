import { describe, expect, it } from 'vitest'

import { matchesCategoryFilter, matchesScheduleFilter, timeOfDayBucket } from './filters'

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

  it('never excludes a club with no occurrence data, regardless of filter', () => {
    expect(matchesScheduleFilter(noOccurrences, [4], ['morning'])).toBe(true)
  })

  it('filters by day of week using the real next occurrence', () => {
    expect(matchesScheduleFilter(thursdayMorning, [4], [])).toBe(true)
    expect(matchesScheduleFilter(thursdayMorning, [1], [])).toBe(false)
  })

  it('filters by time-of-day bucket using the real next occurrence', () => {
    expect(matchesScheduleFilter(thursdayMorning, [], ['morning'])).toBe(true)
    expect(matchesScheduleFilter(thursdayMorning, [], ['evening'])).toBe(false)
  })

  it('never excludes on a time filter when the occurrence has no known time', () => {
    expect(matchesScheduleFilter(thursdayNoTime, [], ['evening'])).toBe(true)
  })

  it('combines day and time as AND, both must match', () => {
    expect(matchesScheduleFilter(thursdayMorning, [4], ['morning'])).toBe(true)
    expect(matchesScheduleFilter(thursdayMorning, [4], ['evening'])).toBe(false)
    expect(matchesScheduleFilter(thursdayMorning, [1], ['morning'])).toBe(false)
  })
})
