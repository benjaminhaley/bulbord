// Builds a subscribable iCalendar feed (feedback #166) — one VCALENDAR with
// many VEVENTs, unlike web/src/calendar/calendarLinks.ts's single-event
// "Add to Calendar" download. Same "floating local time" convention as that
// file (every date/time in this app is timezone-less; no offset is emitted).
// Unlike that file, timed events here carry an explicit TZID: Google Calendar
// (and others) interpret a floating time in a *subscribed* feed as UTC, which
// shifted every event ~5 hours early. All-day events stay date-only.
// UIDs are stable per item so a subscribed calendar updates a listing in
// place on refresh instead of duplicating it.

export interface FeedEntry {
  uid: string
  title: string
  description?: string | null
  location?: string | null
  url?: string
  startDate: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD, inclusive; defaults to startDate
  startTime?: string | null // HH:MM:SS
  endTime?: string | null // HH:MM:SS — defaults to one hour after startTime
  allDay?: boolean
}

const TZID = 'America/Chicago'

// Current US DST rules (second Sunday of March → first Sunday of November).
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0600',
  'TZOFFSETTO:-0500',
  'TZNAME:CDT',
  'DTSTART:20070311T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0600',
  'TZNAME:CST',
  'DTSTART:20071104T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function compactDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function compactDateTime(dateStr: string, time: string): string {
  const [h, m, s] = time.split(':')
  return `${compactDate(dateStr)}T${h}${m}${s ?? '00'}`
}

function defaultEnd(startTime: string): string {
  const [h, m, s] = startTime.split(':').map(Number)
  const end = new Date(Date.UTC(2000, 0, 1, h, m, s || 0) + 60 * 60 * 1000)
  return `${pad(end.getUTCHours())}:${pad(end.getUTCMinutes())}:${pad(end.getUTCSeconds())}`
}

// RFC 5545 §3.3.11 TEXT escaping.
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// RFC 5545 §3.1: lines are limited to 75 octets; continuation lines start
// with a single space. Folds by characters, staying under the octet limit.
export function foldLine(line: string): string {
  if (Buffer.byteLength(line) <= 75) return line
  const parts: string[] = []
  let current = ''
  let limit = 75
  for (const char of line) {
    if (Buffer.byteLength(current + char) > limit) {
      parts.push(current)
      current = char
      limit = 74 // continuation lines lose one octet to the leading space
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.join('\r\n ')
}

function stamp(now: Date): string {
  return `${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

function entryLines(entry: FeedEntry, now: Date): string[] {
  const allDay = entry.allDay || !entry.startTime
  const lines = ['BEGIN:VEVENT', `UID:${entry.uid}`, `DTSTAMP:${stamp(now)}`]
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(entry.startDate)}`)
    lines.push(`DTEND;VALUE=DATE:${compactDate(nextDay(entry.endDate ?? entry.startDate))}`)
  } else {
    const startTime = entry.startTime as string
    lines.push(`DTSTART;TZID=${TZID}:${compactDateTime(entry.startDate, startTime)}`)
    lines.push(`DTEND;TZID=${TZID}:${compactDateTime(entry.startDate, entry.endTime ?? defaultEnd(startTime))}`)
  }
  lines.push(`SUMMARY:${escapeText(entry.title)}`)
  const details = [entry.description, entry.url].filter((v): v is string => Boolean(v)).join('\n\n')
  if (details) lines.push(`DESCRIPTION:${escapeText(details)}`)
  if (entry.location) lines.push(`LOCATION:${escapeText(entry.location)}`)
  if (entry.url) lines.push(`URL:${entry.url}`)
  lines.push('END:VEVENT')
  return lines
}

export function buildIcsFeed(entries: FeedEntry[], calendarName: string, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bulbord//Interested Feed//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    // Hint (Apple Calendar / Google honor it loosely) at how often to re-poll.
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    `X-WR-TIMEZONE:${TZID}`,
    ...VTIMEZONE,
    ...entries.flatMap((entry) => entryLines(entry, now)),
    'END:VCALENDAR',
  ]
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
