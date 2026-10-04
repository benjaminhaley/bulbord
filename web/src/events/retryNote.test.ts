import { describe, expect, it } from 'vitest'

import type { ExtractedEventFields } from './api'
import { applyNoteDecision, toExtractedList } from './retryNote'

const poster: ExtractedEventFields = {
  title: 'Movies in the Park: The Little Vampire',
  description: 'First film.',
  start_date: '2026-10-06',
  start_time: '18:00',
  all_day: false,
  location_name: "Bacino's",
  topic: 'Movie Night',
  additional_events: [
    { title: 'Movies in the Park: Twitches', start_date: '2026-10-13', start_time: '18:00', all_day: false },
    { title: 'Movies in the Park: Casper', start_date: '2026-10-20', start_time: '18:00', all_day: false },
  ],
}

describe('toExtractedList', () => {
  it('flattens a poster into one entry per event, each with the shared place/topic', () => {
    const list = toExtractedList(poster)
    expect(list.map((e) => e.title)).toEqual(['Movies in the Park: The Little Vampire', 'Movies in the Park: Twitches', 'Movies in the Park: Casper'])
    expect(list[2]).toMatchObject({ location_name: "Bacino's", topic: 'Movie Night', start_date: '2026-10-20' })
    expect(list[1].description).toBeUndefined()
    expect(list.every((e) => e.additional_events === undefined)).toBe(true)
  })

  it('keeps a single event as one entry', () => {
    expect(toExtractedList({ title: 'Fest', start_date: '2026-10-06', all_day: true })).toHaveLength(1)
  })
})

describe('applyNoteDecision', () => {
  const list = toExtractedList(poster)
  const edit = {
    action: 'edit' as const,
    explanation: 'Found it.',
    fields: { location_name: "Bacino's Italian Grill", address: '141 W Diversey Pkwy, Chicago, IL 60657', title: 'Retitled' },
  }

  it("applies an edit's place to every open event and its other fields only to the active one", () => {
    const result = applyNoteDecision(list, 1, edit)!
    expect(result.every((e) => e.address === '141 W Diversey Pkwy, Chicago, IL 60657')).toBe(true)
    expect(result.map((e) => e.title)).toEqual(['Movies in the Park: The Little Vampire', 'Retitled', 'Movies in the Park: Casper'])
  })

  it('never touches an already-posted event', () => {
    const result = applyNoteDecision(list, 1, edit, new Set([0]))!
    expect(result[0]).toBe(list[0])
    expect(result[2].address).toBe('141 W Diversey Pkwy, Chicago, IL 60657')
  })

  it('turns a null start_time into an all-day event', () => {
    const result = applyNoteDecision(list, 0, { action: 'edit', explanation: '', fields: { start_time: null } })!
    expect(result[0]).toMatchObject({ all_day: true, start_time: undefined })
  })

  it('replaces the list with the occurrences on a split, keeping the place as a fallback', () => {
    const result = applyNoteDecision([list[0]], 0, {
      action: 'split',
      explanation: 'Split.',
      occurrences: [
        { title: 'A', start_date: '2026-10-06', all_day: true },
        { title: 'B', start_date: '2026-10-13', all_day: true, address: '1 Main St' },
      ],
    })!
    expect(result).toEqual([
      expect.objectContaining({ title: 'A', location_name: "Bacino's", topic: 'Movie Night' }),
      expect.objectContaining({ title: 'B', address: '1 Main St' }),
    ])
  })

  it("won't split once something is posted, and changes nothing for image/cannot", () => {
    const split = { action: 'split' as const, explanation: '', occurrences: [list[0], list[1]] }
    expect(applyNoteDecision(list, 0, split, new Set([0]))).toBeNull()
    expect(applyNoteDecision(list, 0, { action: 'cannot', explanation: 'No.' })).toBeNull()
    expect(applyNoteDecision(list, 0, { action: 'edit', explanation: '', fields: {} })).toBeNull()
  })
})
