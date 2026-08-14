// Compact "when" string for a camp's share-link preview title (feedback #73
// follow-up) — mirrors web/src/camps/format.ts's formatDateRange/timeLabel
// house style (Today/Tomorrow/"This <Weekday>", no :00 minutes, lowercase
// am/pm, shared meridiem shown once), but there's no parity requirement
// between this file and that one (see that file's own header comment) —
// they solve different problems (a full detail-page field vs. one compact
// preview line), so this only needs to be close enough to read naturally,
// not byte-identical. The single-day date-labeling rule itself (bounded to
// the current Sunday-Saturday calendar week — feedback #78) does come from
// the real shared ../dayLabel module rather than a fourth duplicate copy,
// since getting that specific rule right/consistent matters more than this
// file's general "close enough" posture toward the rest of the formatting.

import { dayLabel } from '../dayLabel.js'

function shortDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateRange(startDate: string, endDate: string, now: Date): string {
  if (startDate === endDate) return dayLabel(startDate, now)
  return `${shortDateLabel(startDate)} – ${shortDateLabel(endDate)}`
}

function parseTime(time: string): { hour12: number; minute: number; isPM: boolean } {
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr)
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return { hour12, minute: Number(minuteStr), isPM: hour >= 12 }
}

function formatSingleTime(time: string, showMeridiem: boolean): string {
  const { hour12, minute, isPM } = parseTime(time)
  if (hour12 === 12 && minute === 0) return isPM ? 'noon' : 'midnight'
  const minutePart = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`
  const meridiemPart = showMeridiem ? (isPM ? ' pm' : ' am') : ''
  return `${hour12}${minutePart}${meridiemPart}`
}

function formatTimeRange(startTime: string, endTime: string | null): string {
  if (!endTime) return formatSingleTime(startTime, true)
  const sameMeridiem = parseTime(startTime).isPM === parseTime(endTime).isPM
  return `${formatSingleTime(startTime, !sameMeridiem)} – ${formatSingleTime(endTime, true)}`
}

export function formatCampWhen(
  camp: { startDate: string; endDate: string; startTime: string | null; endTime: string | null },
  now = new Date(),
): string {
  const dateLabel = formatDateRange(camp.startDate, camp.endDate, now)
  // Unlike the app's own always-labeled-even-when-unknown convention (see
  // web/src/camps/format.ts's timeLabel), a share preview title just omits
  // the time entirely when there's none to show — "not specified" reads as
  // noise in a compact external preview card, not as useful honesty.
  if (!camp.startTime) return dateLabel
  return `${dateLabel} · ${formatTimeRange(camp.startTime, camp.endTime)}`
}

// Mirrors web/src/camps/format.ts's locationLabel exactly (venue name,
// falling back to a city/state/zip-stripped address) — same non-parity
// posture as the rest of this file.
const CITY_STATE_ZIP = /,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}$/

export function locationLabel(camp: { address: string | null; locationName: string | null }): string | null {
  if (camp.locationName) return camp.locationName
  return camp.address ? camp.address.replace(CITY_STATE_ZIP, '').trim() : null
}
