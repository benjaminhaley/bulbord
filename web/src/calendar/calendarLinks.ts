// Shared "Add to Calendar" link/file builders (feedback #76) — generic
// across Events and Camps (see CLAUDE.md's Camps section: "no imports from
// events/", so this lives at the top level, not inside either feature
// folder). A timed entry is a real instant (`startsAt`/`endsAt`, what the
// database stores), emitted in UTC so every calendar app shows it at the
// right local time wherever the viewer is; an all-day entry is a plain
// inclusive date range.

export interface CalendarEventInput {
  title: string
  description?: string | null
  location?: string | null
  // Appended to the description as a link back to the listing — optional
  // since a downloaded .ics has nowhere else to point back at the app.
  url?: string
  // Date-only entry: an inclusive YYYY-MM-DD range (endDate defaults to
  // startDate).
  allDay?: boolean
  startDate: string
  endDate?: string
  // Timed entry: real instants. endsAt defaults to one hour after startsAt.
  startsAt?: Date | null
  endsAt?: Date | null
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

function compactDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

// "20260816T143000Z"
function compactUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

// "2026-08-16T14:30:00Z"
function isoUtc(date: Date): string {
  return `${date.toISOString().split('.')[0]}Z`
}

// A timed event with no explicit end gets a one-hour block — the same
// reasonable default most calendar apps' own "quick add" flows use, since
// this app doesn't always know a real end time.
function resolveInstants(input: CalendarEventInput): { start: Date; end: Date } | null {
  if (input.allDay || !input.startsAt) return null
  return { start: input.startsAt, end: input.endsAt ?? new Date(input.startsAt.getTime() + ONE_HOUR_MS) }
}

interface ResolvedRange {
  allDay: boolean
  // Compact (no separators) form for ICS/Google; all-day end is exclusive
  // (the day after the last real day), matching how both formats expect it.
  start: string
  end: string
}

function resolveRange(input: CalendarEventInput): ResolvedRange {
  const instants = resolveInstants(input)
  if (!instants) {
    const endDate = input.endDate ?? input.startDate
    return { allDay: true, start: compactDate(input.startDate), end: compactDate(addDays(endDate, 1)) }
  }
  return { allDay: false, start: compactUtc(instants.start), end: compactUtc(instants.end) }
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
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function outlookCalendarUrl(input: CalendarEventInput): string {
  const instants = resolveInstants(input)
  const endDate = input.endDate ?? input.startDate
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: input.title,
    startdt: instants ? isoUtc(instants.start) : input.startDate,
    enddt: instants ? isoUtc(instants.end) : addDays(endDate, 1),
    allday: String(!instants),
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

export function buildIcs(input: CalendarEventInput): string {
  const { start, end, allDay } = resolveRange(input)
  const details = joinDetails(input)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bulbord//Add to Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@bulbord.com`,
    `DTSTAMP:${compactUtc(new Date())}`,
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
