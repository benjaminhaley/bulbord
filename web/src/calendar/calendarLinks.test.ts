import { describe, expect, it } from 'vitest'

import { buildIcs, googleCalendarUrl, outlookCalendarUrl } from './calendarLinks'

describe('googleCalendarUrl', () => {
  it('builds an exclusive-end all-day date range for a single-day event', () => {
    const url = googleCalendarUrl({ title: 'Movie Night', startDate: '2026-08-16', allDay: true })
    const params = new URL(url).searchParams
    expect(params.get('dates')).toBe('20260816/20260817')
    expect(params.get('text')).toBe('Movie Night')
  })

  it('builds a timed range, defaulting to a one-hour block when no end time is given', () => {
    const url = googleCalendarUrl({ title: 'Story Time', startDate: '2026-08-16', startTime: '09:30:00' })
    expect(new URL(url).searchParams.get('dates')).toBe('20260816T093000/20260816T103000')
  })

  it('uses a given end time over the one-hour default', () => {
    const url = googleCalendarUrl({ title: 'Camp', startDate: '2026-08-16', startTime: '09:00:00', endTime: '15:00:00' })
    expect(new URL(url).searchParams.get('dates')).toBe('20260816T090000/20260816T150000')
  })

  it('spans an exclusive-end all-day range across multiple days', () => {
    const url = googleCalendarUrl({ title: 'Winter Camp', startDate: '2026-12-21', endDate: '2027-01-01', allDay: true })
    expect(new URL(url).searchParams.get('dates')).toBe('20261221/20270102')
  })

  it('joins the description and url into details, and passes location through', () => {
    const url = googleCalendarUrl({
      title: 'Movie Night',
      startDate: '2026-08-16',
      allDay: true,
      description: 'Bring a blanket',
      url: 'https://nettelhorst.bulbord.com/events/abc',
      location: '3450 N Racine Ave',
    })
    const params = new URL(url).searchParams
    expect(params.get('details')).toBe('Bring a blanket\n\nhttps://nettelhorst.bulbord.com/events/abc')
    expect(params.get('location')).toBe('3450 N Racine Ave')
  })
})

describe('outlookCalendarUrl', () => {
  it('marks an all-day event and uses an exclusive end date', () => {
    const url = outlookCalendarUrl({ title: 'Movie Night', startDate: '2026-08-16', allDay: true })
    const params = new URL(url).searchParams
    expect(params.get('allday')).toBe('true')
    expect(params.get('startdt')).toBe('2026-08-16')
    expect(params.get('enddt')).toBe('2026-08-17')
  })

  it('builds a timed start/end datetime', () => {
    const url = outlookCalendarUrl({ title: 'Story Time', startDate: '2026-08-16', startTime: '09:30:00' })
    const params = new URL(url).searchParams
    expect(params.get('allday')).toBe('false')
    expect(params.get('startdt')).toBe('2026-08-16T09:30:00')
    expect(params.get('enddt')).toBe('2026-08-16T10:30:00')
  })
})

describe('buildIcs', () => {
  it('produces a VEVENT with a DATE-valued, exclusive-end DTSTART/DTEND for an all-day event', () => {
    const ics = buildIcs({ title: 'Movie Night', startDate: '2026-08-16', allDay: true })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260816')
    expect(ics).toContain('DTEND;VALUE=DATE:20260817')
    expect(ics).toContain('SUMMARY:Movie Night')
  })

  it('produces a floating (no Z/offset) timed DTSTART/DTEND', () => {
    const ics = buildIcs({ title: 'Story Time', startDate: '2026-08-16', startTime: '09:30:00', endTime: '11:00:00' })
    expect(ics).toContain('DTSTART:20260816T093000')
    expect(ics).toContain('DTEND:20260816T110000')
  })

  it('escapes commas, semicolons, and newlines in text fields', () => {
    const ics = buildIcs({
      title: 'Camp, Session A; B',
      startDate: '2026-08-16',
      allDay: true,
      description: 'Line one\nLine two, with a comma; and a semicolon',
    })
    expect(ics).toContain('SUMMARY:Camp\\, Session A\\; B')
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two\\, with a comma\\; and a semicolon')
  })

  it('includes a LOCATION line only when a location is given', () => {
    expect(buildIcs({ title: 'Movie Night', startDate: '2026-08-16', allDay: true })).not.toContain('LOCATION:')
    expect(buildIcs({ title: 'Movie Night', startDate: '2026-08-16', allDay: true, location: 'Gallagher Way' })).toContain(
      'LOCATION:Gallagher Way',
    )
  })
})
