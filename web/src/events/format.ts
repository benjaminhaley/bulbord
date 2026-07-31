import type { Event } from './api'

function relativeDayLabel(date: Date): string | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayMs = 24 * 60 * 60 * 1000
  const diffDays = Math.round((date.getTime() - today.getTime()) / dayMs)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return null
}

export function formatWhen(event: Event): string {
  const date = new Date(`${event.start_date}T00:00:00`)
  const dateLabel = relativeDayLabel(date) ?? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (event.all_day || !event.start_time) {
    return dateLabel
  }

  const [hours, minutes] = event.start_time.split(':')
  const time = new Date()
  time.setHours(Number(hours), Number(minutes))
  const timeLabel = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return `${dateLabel} · ${timeLabel}`
}

// Addresses are typically stored as "Street, Chicago, IL 60613" — everything
// in this app is Chicago-area, so the city/state/zip is redundant noise in
// the abbreviated list view. The full address (including city/zip) is still
// shown on the event detail page. Addresses come from unstructured scraping
// (see api/src/events/ingest.ts) with no guaranteed shape, so only strip the
// suffix when it actually matches "City, ST ZIP" — otherwise show the
// address as-is rather than risk mangling a format we didn't anticipate.
const CITY_STATE_ZIP = /,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}$/
function streetOnly(address: string): string {
  return address.replace(CITY_STATE_ZIP, '').trim()
}

// Prefer a human-friendly place name over the raw address in list contexts;
// the full address is still shown on the event detail page.
export function locationLabel(event: Event): string | null {
  if (event.location_name) return event.location_name
  return event.address ? streetOnly(event.address) : null
}

export function teaser(description: string | null, maxLength = 90): string | null {
  if (!description) return null
  if (description.length <= maxLength) return description
  return `${description.slice(0, maxLength).trimEnd()}…`
}
