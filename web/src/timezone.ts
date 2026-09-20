// Every event/camp/club date and time is stored as a plain Chicago
// wall-clock value (see CLAUDE.md, "Time zones") — this is the one place that
// knows that, and converts it to a real instant / the viewer's own zone at
// display time (feedback #166 follow-up: a subscribed Google calendar
// showed events 5 hours early). Chicago viewers see no change.
const SOURCE_TIME_ZONE = 'America/Chicago'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Offset (ms, local minus UTC) that `timeZone` has at the given instant.
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

// The real instant (epoch ms) a Chicago wall-clock date+time refers to.
export function chicagoWallClockToInstantMs(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi, s] = time.split(':').map(Number)
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, s || 0)
  // Two passes so a time near a DST switch resolves against the right offset.
  let instant = naiveUtc - zoneOffsetMs(naiveUtc, SOURCE_TIME_ZONE)
  instant = naiveUtc - zoneOffsetMs(instant, SOURCE_TIME_ZONE)
  return instant
}

export function instantToUtcParts(instantMs: number): { date: string; time: string } {
  const d = new Date(instantMs)
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
  }
}

// The viewer's own zone, or an explicit one (tests).
function localParts(instantMs: number, timeZone?: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}:${get('second')}` }
}

export interface LocalizedTimes {
  date: string
  startTime: string | null
  endTime: string | null
}

// Converts a Chicago date + optional start/end time into the viewer's zone.
// `date` follows the start time (it can roll over a midnight for a viewer far
// from Chicago); a missing start time (an all-day / no-time listing) has no
// clock to shift, so the date is returned untouched.
export function localizeWallClock(
  date: string,
  startTime: string | null,
  endTime: string | null,
  timeZone?: string,
): LocalizedTimes {
  if (!startTime) return { date, startTime: null, endTime: null }
  const start = localParts(chicagoWallClockToInstantMs(date, startTime), timeZone)
  const end = endTime ? localParts(chicagoWallClockToInstantMs(date, endTime), timeZone).time : null
  return { date: start.date, startTime: start.time, endTime: end }
}

// Event-shaped convenience for format.ts's formatWhen (kept free of any
// timezone knowledge itself — it's byte-mirrored into the server-side
// newsletter, which is deliberately Chicago-only).
export function localEventTiming(
  date: string,
  startTime: string | null,
  endTime: string | null,
  allDay: boolean,
): { startDate: string; startTime: string | null; endTime: string | null; allDay: boolean } {
  const local = localizeWallClock(date, allDay ? null : startTime, allDay ? null : endTime)
  return { startDate: allDay ? date : local.date, startTime: local.startTime, endTime: local.endTime, allDay }
}
