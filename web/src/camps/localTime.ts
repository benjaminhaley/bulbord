import { localizeWallClock } from '../timezone'
import { timeLabel } from './format'

// camps/format.ts is byte-mirrored into the (Chicago-only) reminder email, so
// the viewer-zone conversion lives here at the web call sites instead.
// The hours are read in the camp's own zone (`time_zone`), and multi-day camps
// convert against their first day's offset.
export function localTimeLabel(startDate: string, startTime: string | null, endTime: string | null, timeZone?: string): string {
  const local = localizeWallClock(startDate, startTime, endTime, timeZone)
  return timeLabel(local.startTime, local.endTime)
}
