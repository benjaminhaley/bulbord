import { describe, expect, it, vi } from 'vitest'

// Only the pure parsing/mapping is tested here; the module's DB-touching
// imports are stubbed so it loads without a database.
vi.mock('../db/client.js', () => ({ db: {} }))
vi.mock('./ingest.js', () => ({ ingestEvents: vi.fn() }))
vi.mock('./candidate-validation.js', () => ({ filterFamilyRelevantCandidates: vi.fn() }))
vi.mock('./retry-strategies.js', () => ({ getRetryStrategiesPromptBlock: vi.fn() }))

import { MAX_SPLIT_OCCURRENCES, occurrenceToCandidate, parseNoteDecision, serializeNoteDecision } from './review-note-actions.js'

const TODAY = '2026-09-28'

describe('parseNoteDecision', () => {
  it('parses a split, dropping past or undated occurrences and aligning all_day with the time', () => {
    const decision = parseNoteDecision(
      {
        action: 'split',
        explanation: 'Found them on the theatre calendar.',
        occurrences: [
          { title: 'Horrors: Halloween', start_date: '2026-10-02', start_time: '19:00', all_day: true, source_url: 'https://mb.example/halloween' },
          { title: 'Horrors: The Thing', start_date: '2026-10-03', all_day: false },
          { title: 'Already happened', start_date: '2026-09-01', start_time: '19:00' },
          { title: 'No date' },
        ],
      },
      TODAY,
    )

    expect(decision).toEqual({
      action: 'split',
      explanation: 'Found them on the theatre calendar.',
      occurrences: [
        { title: 'Horrors: Halloween', description: undefined, startDate: '2026-10-02', startTime: '19:00', allDay: false, locationName: undefined, address: undefined, sourceUrl: 'https://mb.example/halloween' },
        { title: 'Horrors: The Thing', description: undefined, startDate: '2026-10-03', startTime: undefined, allDay: true, locationName: undefined, address: undefined, sourceUrl: undefined },
      ],
    })
  })

  it('turns a split with fewer than two usable occurrences into an explained "cannot"', () => {
    const decision = parseNoteDecision({ action: 'split', explanation: 'Only the opening night is listed.', occurrences: [{ title: 'Opening', start_date: '2026-10-01' }] }, TODAY)

    expect(decision).toEqual({ action: 'cannot', explanation: "Couldn't split it: found only one upcoming dated occurrence. Only the opening night is listed." })
  })

  it('caps a split at MAX_SPLIT_OCCURRENCES', () => {
    const occurrences = Array.from({ length: MAX_SPLIT_OCCURRENCES + 5 }, (_, i) => ({ title: `Show ${i}`, start_date: '2026-10-05' }))
    const decision = parseNoteDecision({ action: 'split', explanation: '', occurrences }, TODAY)

    expect(decision.action === 'split' && decision.occurrences.length).toBe(MAX_SPLIT_OCCURRENCES)
  })

  it('parses an edit, clearing the time when it becomes all-day', () => {
    expect(parseNoteDecision({ action: 'edit', explanation: 'e', fields: { title: 'Better', all_day: true, start_date: 'soon' } }, TODAY)).toEqual({
      action: 'edit',
      explanation: 'e',
      fields: { title: 'Better', startTime: null, allDay: true },
    })
  })

  it('turns an edit with no usable fields into an explained "cannot"', () => {
    expect(parseNoteDecision({ action: 'edit', explanation: 'Nothing to change.', fields: {} }, TODAY)).toEqual({ action: 'cannot', explanation: 'No field changes came back. Nothing to change.' })
  })

  it('passes image and cannot through, and never returns an empty explanation for garbage', () => {
    expect(parseNoteDecision({ action: 'image', explanation: 'About the photo.' }, TODAY)).toEqual({ action: 'image', explanation: 'About the photo.' })
    expect(parseNoteDecision({ action: 'cannot', explanation: 'Not published.' }, TODAY)).toEqual({ action: 'cannot', explanation: 'Not published.' })
    expect(parseNoteDecision({ action: 'teleport' }, TODAY)).toEqual({ action: 'cannot', explanation: 'The note could not be acted on.' })
    expect(parseNoteDecision(null, TODAY).action).toBe('cannot')
  })
})

describe('occurrenceToCandidate', () => {
  it("falls back to the parent listing's venue and source for anything the occurrence doesn't state", () => {
    const candidate = occurrenceToCandidate(
      { title: 'Horrors: Halloween', startDate: '2026-10-02', startTime: '19:00', allDay: false },
      { sourceUrl: 'https://chamber.example/events', address: '3733 N Southport Ave', locationName: 'Music Box Theatre' },
    )

    expect(candidate).toEqual(expect.objectContaining({ sourceUrl: 'https://chamber.example/events', address: '3733 N Southport Ave', locationName: 'Music Box Theatre', status: 'approved' }))
  })
})

// Feedback #180: what POST /events/interpret-retry-note sends the web app.
describe('serializeNoteDecision', () => {
  it('snake_cases an edit', () => {
    expect(serializeNoteDecision({ action: 'edit', explanation: 'Found it.', fields: { locationName: "Bacino's", address: '141 W Diversey Pkwy', startTime: null, allDay: true } })).toEqual({
      action: 'edit',
      explanation: 'Found it.',
      fields: expect.objectContaining({ location_name: "Bacino's", address: '141 W Diversey Pkwy', start_time: null, all_day: true }),
    })
  })

  it('snake_cases split occurrences and passes cannot through', () => {
    const split = serializeNoteDecision({
      action: 'split',
      explanation: 'Split.',
      occurrences: [{ title: 'A', startDate: '2026-10-06', startTime: '18:00', allDay: false, sourceUrl: 'https://x.org' }],
    })
    expect(split).toMatchObject({ occurrences: [{ title: 'A', start_date: '2026-10-06', start_time: '18:00', all_day: false, source_url: 'https://x.org' }] })
    expect(serializeNoteDecision({ action: 'cannot', explanation: 'No.' })).toEqual({ action: 'cannot', explanation: 'No.' })
  })
})
