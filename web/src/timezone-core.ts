// Pure Intl-based time-zone conversion, kept byte-identical between
// web/src/timezone-core.ts and api/src/timezone-core.ts (enforced by
// scripts/check-format-parity.mjs, same convention as the format.ts pairs).
//
// The database stores every point in time as a real UTC instant
// (timestamptz). The only wall-clock values left are (a) listing dates
// that are inherently calendar days, and (b) a camp's daily hours, which
// are venue-local by nature and always paired with an explicit time zone.
// Everything that has to go between a wall-clock value and an instant goes
// through here.
export const CHICAGO_TIME_ZONE = 'America/Chicago'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function zoneParts(instantMs: number, timeZone: string | undefined): Record<string, number> {
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
  const out: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return out
}

// Offset (ms, wall-clock minus UTC) `timeZone` has at the given instant.
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const p = zoneParts(instantMs, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

// The real instant (epoch ms) a wall-clock `YYYY-MM-DD` + `HH:MM[:SS]` in
// `timeZone` refers to. Two passes so a time near a DST switch resolves
// against the right offset.
export function wallClockToInstantMs(date: string, time: string, timeZone: string = CHICAGO_TIME_ZONE): number {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi, s] = time.split(':').map(Number)
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, s || 0)
  const first = naiveUtc - zoneOffsetMs(naiveUtc, timeZone)
  return naiveUtc - zoneOffsetMs(first, timeZone)
}

// The wall-clock date/time an instant reads as in `timeZone` (the viewer's
// own zone when omitted).
export function instantToWallClock(instantMs: number, timeZone?: string): { date: string; time: string } {
  const p = zoneParts(instantMs, timeZone)
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`,
  }
}
