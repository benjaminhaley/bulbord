import { describe, expect, it } from 'vitest'

import { pipelineReviewSubject, renderPipelineReviewHtml } from './pipeline-review-template.js'
import type { KeptReviewItem, RejectedReviewItem } from './pipeline-review-service.js'

function kept(overrides: Partial<KeptReviewItem> = {}): KeptReviewItem {
  return {
    id: 'kept-1',
    title: 'Fall Festival',
    sourceId: 'source-1',
    sourceName: 'Example Source',
    createdAt: new Date('2026-09-09T12:00:00Z'),
    status: 'approved',
    imageUrl: '/uploads/events/a.jpg',
    thumbnailUrl: '/uploads/events/a-thumb.jpg',
    startDate: '2026-10-10',
    startTime: null,
    allDay: true,
    address: '3252 N Broadway',
    locationName: 'Nettelhorst School',
    description: 'Games, food trucks, and a costume parade.',
    relevanceReason: 'legitimate neighborhood festival',
    checks: null,
    pipelineChecksPassed: true,
    reviewedAt: null,
    reviewedByName: null,
    reviewNote: null,
    ...overrides,
  }
}

function rejected(overrides: Partial<RejectedReviewItem> = {}): RejectedReviewItem {
  return {
    id: 'rejected-1',
    title: 'Adults-only Wine Tasting',
    sourceId: 'source-1',
    sourceName: 'Example Source',
    candidateData: {
      title: 'Adults-only Wine Tasting',
      startDate: '2026-10-10',
      allDay: true,
      sourceUrl: 'https://example.com/wine',
      status: 'approved',
    },
    rejectionType: 'relevance',
    rejectionReason: 'age-restricted',
    duplicateOfEventId: null,
    duplicateOfEventTitle: null,
    createdAt: new Date('2026-09-09T12:00:00Z'),
    reviewedAt: null,
    reviewedByName: null,
    reviewAction: null,
    reviewNote: null,
    addedAsEventId: null,
    ...overrides,
  }
}

describe('pipelineReviewSubject', () => {
  it('includes the kept/rejected counts and a short date in "run" mode', () => {
    const subject = pipelineReviewSubject(new Date('2026-09-09T12:00:00Z'), 8, 3, 'run')
    expect(subject).toBe('Pipeline Review: 8 added, 3 rejected — Wed, Sep 9')
  })

  it('says "awaiting review" with no date claim in "backlog" mode', () => {
    const subject = pipelineReviewSubject(new Date('2026-09-09T12:00:00Z'), 8, 3, 'backlog')
    expect(subject).toBe('Pipeline Review: 8 awaiting review, 3 rejected')
  })

  it('prepends a test prefix when given one', () => {
    const subject = pipelineReviewSubject(new Date('2026-09-09T12:00:00Z'), 0, 0, 'backlog', '[Test] ')
    expect(subject).toMatch(/^\[Test\] Pipeline Review:/)
  })
})

describe('renderPipelineReviewHtml', () => {
  it('reports separate relevance/duplicate rejection counts', () => {
    const html = renderPipelineReviewHtml({
      runDate: new Date('2026-09-09T12:00:00Z'),
      kept: [kept()],
      rejected: [rejected(), rejected({ id: 'rejected-2', rejectionType: 'duplicate', rejectionReason: 'Exact match' })],
      webUrl: 'https://nettelhorst.bulbord.com',
      mode: 'run',
    })

    expect(html).toContain('<strong>1</strong> event added')
    expect(html).toContain('<strong>2</strong> candidates rejected (1 not relevant, 1 duplicate)')
    expect(html).toContain('href="https://nettelhorst.bulbord.com/admin/pipeline-review"')
  })

  it('claims a run happened in "run" mode but not in "backlog" mode', () => {
    const runHtml = renderPipelineReviewHtml({ runDate: new Date('2026-09-09T12:00:00Z'), kept: [], rejected: [], webUrl: 'https://example.com', mode: 'run' })
    expect(runHtml).toContain('The event-sourcing pipeline ran')

    const backlogHtml = renderPipelineReviewHtml({ runDate: new Date('2026-09-09T12:00:00Z'), kept: [], rejected: [], webUrl: 'https://example.com', mode: 'backlog' })
    expect(backlogHtml).not.toContain('The event-sourcing pipeline ran')
    expect(backlogHtml).toContain('awaiting your review')
  })

  it('calls out how many kept events are held back by a failing check', () => {
    const html = renderPipelineReviewHtml({
      runDate: new Date('2026-09-09T12:00:00Z'),
      kept: [kept({ id: 'a', status: 'approved' }), kept({ id: 'b', status: 'pending' })],
      rejected: [],
      webUrl: 'https://example.com',
      mode: 'run',
    })

    expect(html).toContain('<strong>1</strong> held back')
  })

  it('escapes candidate titles and reasons before embedding them in HTML', () => {
    const html = renderPipelineReviewHtml({
      runDate: new Date('2026-09-09T12:00:00Z'),
      kept: [],
      rejected: [rejected({ title: '<script>alert(1)</script>', rejectionReason: 'a & b' })],
      webUrl: 'https://nettelhorst.bulbord.com',
      mode: 'run',
    })

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &amp; b')
  })

  it('renders a plain "0 events added" / "0 candidates rejected" summary when nothing happened', () => {
    const html = renderPipelineReviewHtml({
      runDate: new Date('2026-09-09T12:00:00Z'),
      kept: [],
      rejected: [],
      webUrl: 'https://nettelhorst.bulbord.com',
      mode: 'run',
    })

    expect(html).toContain('<strong>0</strong> events added')
    expect(html).toContain('<strong>0</strong> candidates rejected (0 not relevant, 0 duplicate)')
  })
})
