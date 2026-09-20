import { localizeWallClock } from '../timezone'
import { timeLabel } from './format'

// camps/format.ts is byte-mirrored into the (Chicago-only) reminder email, so
// the viewer-zone conversion lives here at the web call sites instead.
// Multi-day camps convert against their first day's offset.
export function localTimeLabel(startDate: string, startTime: string | null, endTime: string | null): string {
  const local = localizeWallClock(startDate, startTime, endTime)
  return timeLabel(local.startTime, local.endTime)
}
