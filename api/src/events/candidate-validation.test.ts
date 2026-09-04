import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CandidateEvent } from './ingest.js'

const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: createMock }
  }
  return { default: MockAnthropic }
})

function textResponse(text: string, stopReason = 'end_turn') {
  return { stop_reason: stopReason, content: [{ type: 'text', text }] }
}

function candidate(overrides: Partial<CandidateEvent> = {}): CandidateEvent {
  return {
    title: 'Some Event',
    startDate: '2026-10-01',
    allDay: true,
    sourceUrl: 'https://example.com/page',
    status: 'approved',
    ...overrides,
  }
}

describe('filterFamilyRelevantCandidates', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    createMock.mockReset()
    vi.resetModules()
  })

  it('returns candidates unchanged when the list is empty (no API call made)', async () => {
    const { filterFamilyRelevantCandidates } = await import('./candidate-validation.js')

    const result = await filterFamilyRelevantCandidates([])

    expect(result).toEqual({ kept: [], rejected: [] })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('drops a candidate the model marks keep: false, keeps the rest', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify([{ keep: true }, { keep: false, reason: 'age-restricted' }])))
    const { filterFamilyRelevantCandidates } = await import('./candidate-validation.js')
    const good = candidate({ title: 'Nettelhorst French Market' })
    const bad = candidate({ title: 'Sharing Wellness and Nature (SWAN)', description: 'A premium program for adults (18+).' })

    const result = await filterFamilyRelevantCandidates([good, bad])

    expect(result).toEqual({ kept: [good], rejected: [{ title: bad.title, reason: 'age-restricted' }] })
  })

  it('rejects a Northalsted-style crawl and a vague-area-only location in one batch', async () => {
    createMock.mockResolvedValue(
      textResponse(JSON.stringify([{ keep: false, reason: 'bar crawl' }, { keep: false, reason: 'vague location' }])),
    )
    const { filterFamilyRelevantCandidates } = await import('./candidate-validation.js')
    const crawl = candidate({
      title: 'Taste of Northalsted 2026 Fall Food & Drink Sampling Crawl',
      description: 'A neighborhood food and drink sampling crawl through Northalsted.',
      locationName: 'Northalsted',
    })
    const vagueLocation = candidate({ title: 'A Craft Series September: Jeanius', locationName: 'Northalsted' })

    const result = await filterFamilyRelevantCandidates([crawl, vagueLocation])

    expect(result).toEqual({
      kept: [],
      rejected: [
        { title: crawl.title, reason: 'bar crawl' },
        { title: vagueLocation.title, reason: 'vague location' },
      ],
    })
  })

  it('fails open (keeps every candidate) when there is no API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { filterFamilyRelevantCandidates } = await import('./candidate-validation.js')
    const only = candidate()

    const result = await filterFamilyRelevantCandidates([only])

    expect(result).toEqual({ kept: [only], rejected: [] })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('fails open when the model response is malformed JSON', async () => {
    createMock.mockResolvedValue(textResponse('not json'))
    const { filterFamilyRelevantCandidates } = await import('./candidate-validation.js')
    const only = candidate()

    const result = await filterFamilyRelevantCandidates([only])

    expect(result).toEqual({ kept: [only], rejected: [] })
  })

  it('fails open when the response array length does not match the input', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify([{ keep: false }])))
    const { filterFamilyRelevantCandidates } = await import('./candidate-validation.js')
    const one = candidate({ title: 'One' })
    const two = candidate({ title: 'Two' })

    const result = await filterFamilyRelevantCandidates([one, two])

    expect(result).toEqual({ kept: [one, two], rejected: [] })
  })

  it('fails open on a refusal stop_reason', async () => {
    createMock.mockResolvedValue(textResponse('', 'refusal'))
    const { filterFamilyRelevantCandidates } = await import('./candidate-validation.js')
    const only = candidate()

    const result = await filterFamilyRelevantCandidates([only])

    expect(result).toEqual({ kept: [only], rejected: [] })
  })
})
