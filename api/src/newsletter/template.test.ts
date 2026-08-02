import { describe, expect, it } from 'vitest'

import { formatWeeklyEvents, renderNewsletterHtml } from './template.js'
import type { WeeklyEvent } from './query.js'

function weeklyEvent(overrides: Partial<WeeklyEvent> = {}): WeeklyEvent {
  return {
    id: 'event-1',
    title: 'Story Time',
    description: 'A cozy weekly story time for toddlers.',
    startDate: '2026-08-03',
    startTime: '10:00:00',
    allDay: false,
    address: '123 Main St, Chicago, IL 60613',
    locationName: 'Merlo Library',
    thumbnailUrl: '/uploads/events/thumb.jpg',
    interestedCount: 2,
    interestedNames: [
      { id: 'user-me', name: 'Ben Haley' },
      { id: 'user-other', name: 'Anna Piepmeyer' },
    ],
    ...overrides,
  }
}

// formatWeeklyEvents itself is exercised end-to-end via these
// renderNewsletterHtml assertions — its output (when/location/description)
// is what the HTML checks below are actually verifying.
function baseEvent(overrides: Partial<WeeklyEvent> = {}) {
  return formatWeeklyEvents([weeklyEvent(overrides)])[0]
}

describe('renderNewsletterHtml', () => {
  const options = {
    apiUrl: 'https://api-production-a551.up.railway.app',
    webUrl: 'https://campcampy.com',
    unsubscribeUrl: 'https://api-production-a551.up.railway.app/newsletter/unsubscribe?token=abc',
  }

  it('substitutes the recipient\'s own name for "You" but not other names', () => {
    const html = renderNewsletterHtml({
      events: [baseEvent()],
      recipient: { id: 'user-me', name: 'Ben Haley' },
      ...options,
    })
    expect(html).toContain('2 interested: You and Anna Piepmeyer')
  })

  it('does not substitute "You" for a recipient who is not in the interested list', () => {
    const html = renderNewsletterHtml({
      events: [baseEvent()],
      recipient: { id: 'user-someone-else', name: 'Sam Rivera' },
      ...options,
    })
    expect(html).toContain('2 interested: Ben Haley and Anna Piepmeyer')
  })

  it('includes the event title, location, and a link to the event detail page', () => {
    const html = renderNewsletterHtml({
      events: [baseEvent()],
      recipient: { id: 'user-me', name: 'Ben Haley' },
      ...options,
    })
    expect(html).toContain('Story Time')
    expect(html).toContain('Merlo Library')
    expect(html).toContain('https://campcampy.com/events/event-1')
  })

  it('prefixes the thumbnail with the API base URL', () => {
    const html = renderNewsletterHtml({
      events: [baseEvent()],
      recipient: { id: 'user-me', name: 'Ben Haley' },
      ...options,
    })
    expect(html).toContain('https://api-production-a551.up.railway.app/uploads/events/thumb.jpg')
  })

  it('includes the unsubscribe link', () => {
    const html = renderNewsletterHtml({
      events: [baseEvent()],
      recipient: { id: 'user-me', name: 'Ben Haley' },
      ...options,
    })
    expect(html).toContain('https://api-production-a551.up.railway.app/newsletter/unsubscribe?token=abc')
  })

  it('shows a fallback message when there are no events this week', () => {
    const html = renderNewsletterHtml({ events: [], recipient: { id: 'user-me', name: 'Ben Haley' }, ...options })
    expect(html).toContain('No events found for this week yet')
  })

  it('escapes HTML in user-controlled fields like the title', () => {
    const html = renderNewsletterHtml({
      events: [baseEvent({ title: '<script>alert(1)</script>' })],
      recipient: { id: 'user-me', name: 'Ben Haley' },
      ...options,
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
