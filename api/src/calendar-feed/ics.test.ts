import { describe, expect, it } from 'vitest'

import { buildIcsFeed, foldLine } from './ics.js'

const NOW = new Date('2026-09-19T12:00:00Z')

describe('buildIcsFeed', () => {
  it('emits a timed event with a one-hour default end and stable UID', () => {
    const ics = buildIcsFeed([{ uid: 'event-1@bulbord.com', title: 'Bike Bus', startDate: '2026-09-25', startTime: '08:00:00' }], 'Cal', NOW)
    expect(ics).toContain('UID:event-1@bulbord.com')
    expect(ics).toContain('DTSTART;TZID=America/Chicago:20260925T080000')
    expect(ics).toContain('DTEND;TZID=America/Chicago:20260925T090000')
    expect(ics).toContain('BEGIN:VTIMEZONE')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('emits an all-day multi-day range with an exclusive end', () => {
    const ics = buildIcsFeed([{ uid: 'c', title: 'Camp', startDate: '2026-10-12', endDate: '2026-10-14', allDay: true }], 'Cal', NOW)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261012')
    expect(ics).toContain('DTEND;VALUE=DATE:20261015')
  })

  it('treats a missing start time as all-day and escapes text', () => {
    const ics = buildIcsFeed([{ uid: 'e', title: 'A, B; C', startDate: '2026-09-25', description: 'line1\nline2' }], 'Cal', NOW)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260925')
    expect(ics).toContain('SUMMARY:A\\, B\; C')
    expect(ics).toContain('DESCRIPTION:line1\\nline2')
  })

  it('folds long lines under 75 octets', () => {
    const folded = foldLine(`DESCRIPTION:${'x'.repeat(200)}`)
    for (const l of folded.split('\r\n')) expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'x'.repeat(200)}`)
  })
})
