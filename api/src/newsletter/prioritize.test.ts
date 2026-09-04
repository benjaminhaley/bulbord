import { describe, expect, it } from 'vitest'

import { prioritizeNewsletterEvents, type WeeklyEventCandidate } from './prioritize.js'

function candidate(overrides: Partial<WeeklyEventCandidate>): WeeklyEventCandidate {
  return {
    id: 'event-1',
    title: 'Some Event',
    description: null,
    startDate: '2026-09-10',
    startTime: null,
    endTime: null,
    allDay: true,
    address: null,
    locationName: null,
    thumbnailUrl: null,
    interestedCount: 0,
    interestedNames: [],
    isRecurring: false,
    ...overrides,
  }
}

describe('prioritizeNewsletterEvents', () => {
  it('puts every non-recurring event ahead of every recurring one, regardless of interest', () => {
    const oneTime = candidate({ id: 'one-time', isRecurring: false, interestedCount: 0 })
    const popularRecurring = candidate({ id: 'popular-recurring', isRecurring: true, interestedCount: 50 })

    const result = prioritizeNewsletterEvents([popularRecurring, oneTime])

    expect(result.map((e) => e.id)).toEqual(['one-time', 'popular-recurring'])
  })

  it('preserves the incoming (chronological) order among non-recurring events', () => {
    const first = candidate({ id: 'first', isRecurring: false })
    const second = candidate({ id: 'second', isRecurring: false })

    const result = prioritizeNewsletterEvents([first, second])

    expect(result.map((e) => e.id)).toEqual(['first', 'second'])
  })

  it('sorts recurring events by interest count, most interested first', () => {
    const low = candidate({ id: 'low', isRecurring: true, interestedCount: 1 })
    const high = candidate({ id: 'high', isRecurring: true, interestedCount: 5 })

    const result = prioritizeNewsletterEvents([low, high])

    expect(result.map((e) => e.id)).toEqual(['high', 'low'])
  })

  it('breaks ties among equally-interesting recurring events randomly', () => {
    const a = candidate({ id: 'a', isRecurring: true, interestedCount: 0 })
    const b = candidate({ id: 'b', isRecurring: true, interestedCount: 0 })
    const c = candidate({ id: 'c', isRecurring: true, interestedCount: 0 })

    // A fixed sequence of "random" values makes the tiebreak order
    // deterministic for the test, while still exercising the real
    // random-tiebreak code path (not a fixed sort by id/insertion order).
    const values = [0.9, 0.1, 0.5]
    let i = 0
    const fakeRandom = () => values[i++]

    const result = prioritizeNewsletterEvents([a, b, c], fakeRandom)

    expect(result.map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('caps the total at 10, filling remaining slots from recurring events after all non-recurring ones', () => {
    const nonRecurring = Array.from({ length: 8 }, (_, i) => candidate({ id: `nr-${i}`, isRecurring: false }))
    const recurring = Array.from({ length: 5 }, (_, i) => candidate({ id: `r-${i}`, isRecurring: true, interestedCount: i }))

    const result = prioritizeNewsletterEvents([...nonRecurring, ...recurring])

    expect(result).toHaveLength(10)
    expect(result.slice(0, 8).map((e) => e.id)).toEqual(nonRecurring.map((e) => e.id))
    // Only the 2 most-interested recurring events fit in the remaining slots.
    expect(result.slice(8).map((e) => e.id)).toEqual(['r-4', 'r-3'])
  })

  it('drops recurring events entirely once non-recurring events alone fill every slot', () => {
    const nonRecurring = Array.from({ length: 10 }, (_, i) => candidate({ id: `nr-${i}`, isRecurring: false }))
    const recurring = [candidate({ id: 'r-0', isRecurring: true, interestedCount: 100 })]

    const result = prioritizeNewsletterEvents([...nonRecurring, ...recurring])

    expect(result).toHaveLength(10)
    expect(result.every((e) => !e.id.startsWith('r-'))).toBe(true)
  })

  it('strips the isRecurring flag from the returned events', () => {
    const result = prioritizeNewsletterEvents([candidate({ isRecurring: false })])

    expect(result[0]).not.toHaveProperty('isRecurring')
  })
})
