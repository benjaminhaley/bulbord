// Shared "Add to calendar" link/file builders (feedback #76) — generic
// across Events and Camps, the same "truly generic shared infra" bar as
// auth/uploads/Avatar/dayLabel.ts (see CLAUDE.md's Camps section: "no
// imports from events/", so this lives at the top level, not inside either
// feature folder). No timezone conversion is done anywhere here: every
// date/time in this app is already a plain, timezone-less local value (see
// api/src/db/schema.ts's `date`/`time` columns, no offset stored) — every
// calendar target below gets a "floating" local time with no UTC/offset
// suffix, the same convention RFC 5545 itself uses for a timezone-less
// DTSTART, and consistent with how the rest of this codebase never does
// timezone math client-side either (dayLabel.ts parses a bare date the same
// way). A recipient's own calendar app renders a floating time in whatever
// timezone it's already set to — correct for this app's Chicago-area
// audience without needing real TZ-conversion logic.

export interface CalendarEventInput {
  title: string
  description?: string | null
  location?: string | null
  // Appended to the description as a link back to the listing — optional
  // since a downloaded .ics has nowhere else to point back at the app.
  url?: string
  startDate: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD, inclusive; defaults to startDate
  startTime?: string | null // HH:MM:SS, 24h
  endTime?: string | null // HH:MM:SS — defaults to one hour after startTime
  allDay?: boolean
}

const ONE_HOUR_MS = 60 * 60 * 1000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// A timed event with no explicit end time gets a one-hour block — the same
// reasonable default most calendar apps' own "quick add" flows use, since
// this app doesn't always know a real end time (events have no end_time
// field at all; camps' end_time is frequently unset).
function resolveEndTime(startTime: string, endTime: string | null | undefined): string {
  if (endTime) return endTime
  const [h, m, s] = startTime.split(':').map(Number)
  const end = new Date(2000, 0, 1, h, m, s || 0)
  end.setTime(end.getTime() + ONE_HOUR_MS)
  return `${pad(end.getHours())}:${pad(end.getMinutes())}:${pad(end.getSeconds())}`
}

function compactDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

function compactDateTime(dateStr: string, time: string): string {
  return `${compactDate(dateStr)}T${time.replace(/:/g, '')}`
}

interface ResolvedRange {
  allDay: boolean
  // Compact (no separators) form for ICS/Google; all-day end is exclusive
  // (the day after the last real day), matching how both formats expect it.
  start: string
  end: string
}

// A timed event has no explicit end date in this app's data model (events
// are single-date; a camp's end_date is the whole multi-day range's end,
// not a per-day event end) — a timed calendar block always ends the same
// day it starts.
function resolveRange(input: CalendarEventInput): ResolvedRange {
  if (input.allDay || !input.startTime) {
    const endDate = input.endDate ?? input.startDate
    return { allDay: true, start: compactDate(input.startDate), end: compactDate(addDays(endDate, 1)) }
  }
  const endTime = resolveEndTime(input.startTime, input.endTime)
  return {
    allDay: false,
    start: compactDateTime(input.startDate, input.startTime),
    end: compactDateTime(input.startDate, endTime),
  }
}

function joinDetails(input: CalendarEventInput): string | null {
  const parts = [input.description, input.url].filter((v): v is string => Boolean(v))
  return parts.length > 0 ? parts.join('\n\n') : null
}

export function googleCalendarUrl(input: CalendarEventInput): string {
  const { start, end } = resolveRange(input)
  const params = new URLSearchParams({ action: 'TEMPLATE', text: input.title, dates: `${start}/${end}` })
  const details = joinDetails(input)
  if (details) params.set('details', details)
  if (input.location) params.set('location', input.location)
  // Only matters for a timed event (an all-day `dates` value has no time
  // component to interpret) — see this file's header comment on floating
  // times.
  params.set('ctz', 'America/Chicago')
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function outlookCalendarUrl(input: CalendarEventInput): string {
  const { allDay } = resolveRange(input)
  const endDate = input.endDate ?? input.startDate
  const startTime = input.startTime ?? '00:00:00'
  const endTime = allDay ? '00:00:00' : resolveEndTime(input.startTime as string, input.endTime)
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: input.title,
    startdt: allDay ? input.startDate : `${input.startDate}T${startTime}`,
    enddt: allDay ? addDays(endDate, 1) : `${input.startDate}T${endTime}`,
    allday: String(allDay),
  })
  const details = joinDetails(input)
  if (details) params.set('body', details)
  if (input.location) params.set('location', input.location)
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}

// RFC 5545 §3.3.11 TEXT value escaping.
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function icsUtcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

export function buildIcs(input: CalendarEventInput): string {
  const { start, end, allDay } = resolveRange(input)
  const details = joinDetails(input)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bulbord//Add to Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@bulbord.com`,
    `DTSTAMP:${icsUtcStamp(new Date())}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
    allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
  ]
  if (details) lines.push(`DESCRIPTION:${escapeIcsText(details)}`)
  if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadIcs(input: CalendarEventInput, filename: string): void {
  const blob = new Blob([buildIcs(input)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
