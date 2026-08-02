// Server-side ports of the pure formatting helpers from web/src/events/
// format.ts and InterestedBadge.tsx, for the newsletter's HTML email
// template. Duplicated rather than shared across the web/api package
// boundary — there's no shared-package setup between them (see CLAUDE.md's
// Application architecture), and this is ~20 lines of pure date/string
// logic, not worth introducing one for.

function relativeDayLabel(date: Date, today: Date): string | null {
  const dayMs = 24 * 60 * 60 * 1000
  const diffDays = Math.round((date.getTime() - today.getTime()) / dayMs)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return null
}

export function formatWhen(
  event: { startDate: string; startTime: string | null; allDay: boolean },
  now = new Date(),
): string {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const date = new Date(`${event.startDate}T00:00:00`)
  const dateLabel =
    relativeDayLabel(date, today) ?? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (event.allDay || !event.startTime) return dateLabel

  const [hours, minutes] = event.startTime.split(':')
  const time = new Date()
  time.setHours(Number(hours), Number(minutes))
  const timeLabel = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return `${dateLabel} · ${timeLabel}`
}

const CITY_STATE_ZIP = /,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}$/

export function locationLabel(event: { locationName: string | null; address: string | null }): string | null {
  if (event.locationName) return event.locationName
  return event.address ? event.address.replace(CITY_STATE_ZIP, '').trim() : null
}

export function teaser(description: string | null, maxLength = 90): string | null {
  if (!description) return null
  if (description.length <= maxLength) return description
  return `${description.slice(0, maxLength).trimEnd()}…`
}

function joinWithAnd(names: string[]): string {
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const INTERESTED_TEASER_MAX_CHARS = 30

export function buildInterestedTeaser(names: string[], totalCount: number, maxChars = INTERESTED_TEASER_MAX_CHARS): string {
  for (let shown = names.length; shown >= 1; shown--) {
    const truncated = shown < names.length
    const text = truncated ? `${names.slice(0, shown).join(', ')}…` : joinWithAnd(names.slice(0, shown))
    if (text.length <= maxChars || shown === 1) return `${totalCount} interested: ${text}`
  }
  return `${totalCount} interested`
}
