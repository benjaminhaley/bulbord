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
    relevanceReason: 'legitimate neighborhood festival',
    qualityChecks: null,
    imageTrace: null,
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
  it('includes the kept/rejected counts and a short date', () => {
    const subject = pipelineReviewSubject(new Date('2026-09-09T12:00:00Z'), 8, 3)
    expect(subject).toBe('Pipeline Review: 8 added, 3 rejected — Wed, Sep 9')
  })

  it('prepends a test prefix when given one', () => {
    const subject = pipelineReviewSubject(new Date('2026-09-09T12:00:00Z'), 0, 0, '[Test] ')
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
    })

    expect(html).toContain('<strong>1</strong> event added')
    expect(html).toContain('<strong>2</strong> candidates rejected (1 not relevant, 1 duplicate)')
    expect(html).toContain('href="https://nettelhorst.bulbord.com/admin/pipeline-review"')
  })

  it('escapes candidate titles and reasons before embedding them in HTML', () => {
    const html = renderPipelineReviewHtml({
      runDate: new Date('2026-09-09T12:00:00Z'),
      kept: [],
      rejected: [rejected({ title: '<script>alert(1)</script>', rejectionReason: 'a & b' })],
      webUrl: 'https://nettelhorst.bulbord.com',
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
    })

    expect(html).toContain('<strong>0</strong> events added')
    expect(html).toContain('<strong>0</strong> candidates rejected (0 not relevant, 0 duplicate)')
  })
})
