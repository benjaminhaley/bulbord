import { describe, expect, it } from 'vitest'

import { buildBreakBuckets, groupCampsByBreak, rangesOverlap, type SchoolBreakRow } from './grouping.js'

const winterBreak: SchoolBreakRow = {
  id: 'winter',
  name: 'Winter Break',
  startDate: '2026-12-21',
  endDate: '2027-01-01',
  splitWeekly: false,
}

const summerBreak: SchoolBreakRow = {
  id: 'summer',
  name: 'Summer Break',
  startDate: '2026-06-05',
  endDate: '2026-06-25', // 3 weeks: Jun5-11, Jun12-18, Jun19-25
  splitWeekly: true,
}

describe('rangesOverlap', () => {
  it('is true when ranges overlap partially', () => {
    expect(rangesOverlap('2026-12-19', '2026-12-23', '2026-12-21', '2027-01-01')).toBe(true)
  })

  it('is true when one range fully contains the other', () => {
    expect(rangesOverlap('2026-12-22', '2026-12-23', '2026-12-21', '2027-01-01')).toBe(true)
  })

  it('is false when ranges do not touch', () => {
    expect(rangesOverlap('2026-01-01', '2026-01-05', '2026-12-21', '2027-01-01')).toBe(false)
  })
})

describe('buildBreakBuckets', () => {
  it('returns a non-split break as a single bucket matching its own range', () => {
    const buckets = buildBreakBuckets([winterBreak])
    expect(buckets).toEqual([
      {
        id: 'winter',
        breakId: 'winter',
        name: 'Winter Break',
        label: 'Winter Break',
        startDate: '2026-12-21',
        endDate: '2027-01-01',
        isWeeklyBucket: false,
      },
    ])
  })

  it('splits a splitWeekly break into 7-day buckets anchored on its start date', () => {
    const buckets = buildBreakBuckets([summerBreak])
    expect(buckets.map((b) => [b.startDate, b.endDate])).toEqual([
      ['2026-06-05', '2026-06-11'],
      ['2026-06-12', '2026-06-18'],
      ['2026-06-19', '2026-06-25'],
    ])
    expect(buckets.every((b) => b.isWeeklyBucket)).toBe(true)
  })

  it('truncates the final weekly bucket at the break end_date when it is not a clean multiple of 7 days', () => {
    const oddBreak: SchoolBreakRow = { id: 'x', name: 'X', startDate: '2026-06-05', endDate: '2026-06-13', splitWeekly: true }
    const buckets = buildBreakBuckets([oddBreak])
    expect(buckets.map((b) => [b.startDate, b.endDate])).toEqual([
      ['2026-06-05', '2026-06-11'],
      ['2026-06-12', '2026-06-13'],
    ])
  })
})

describe('groupCampsByBreak', () => {
  it('includes a camp that only partially covers a break range', () => {
    const camps = [{ id: 'c1', startDate: '2026-12-19', endDate: '2026-12-23' }]
    const groups = groupCampsByBreak([winterBreak], camps, '2026-08-01')
    expect(groups).toHaveLength(1)
    expect(groups[0].camps.map((c) => c.id)).toEqual(['c1'])
  })

  it('places a multi-week summer camp under every week it overlaps', () => {
    const camps = [{ id: 'c1', startDate: '2026-06-08', endDate: '2026-06-22' }]
    const groups = groupCampsByBreak([summerBreak], camps, '2026-06-01')
    expect(groups).toHaveLength(3)
    expect(groups.every((g) => g.camps.some((c) => c.id === 'c1'))).toBe(true)
  })

  it('excludes a weekly bucket whose own end_date has already passed, even while the parent break is still upcoming', () => {
    const groups = groupCampsByBreak([summerBreak], [], '2026-06-15')
    expect(groups.map((g) => g.bucket.startDate)).toEqual(['2026-06-12', '2026-06-19'])
  })

  it('still returns a break/bucket with zero matching camps', () => {
    const groups = groupCampsByBreak([winterBreak], [], '2026-08-01')
    expect(groups).toHaveLength(1)
    expect(groups[0].camps).toEqual([])
  })

  it('collects a camp overlapping no known break into a trailing "Other" bucket', () => {
    const camps = [{ id: 'c1', startDate: '2026-09-05', endDate: '2026-09-05' }]
    const groups = groupCampsByBreak([winterBreak], camps, '2026-08-01')
    expect(groups).toHaveLength(2)
    expect(groups[1].bucket.id).toBe('other')
    expect(groups[1].camps.map((c) => c.id)).toEqual(['c1'])
  })

  it('omits the "Other" bucket entirely when every camp matched a real break', () => {
    const camps = [{ id: 'c1', startDate: '2026-12-22', endDate: '2026-12-23' }]
    const groups = groupCampsByBreak([winterBreak], camps, '2026-08-01')
    expect(groups.some((g) => g.bucket.id === 'other')).toBe(false)
  })

  it('orders buckets chronologically by start_date', () => {
    const groups = groupCampsByBreak([winterBreak, summerBreak], [], '2026-01-01')
    const starts = groups.map((g) => g.bucket.startDate)
    expect([...starts].sort()).toEqual(starts)
  })
})
