import type { Event } from './api'

export function formatWhen(event: Event): string {
  const date = new Date(`${event.start_date}T00:00:00`)
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (event.all_day || !event.start_time) {
    return dateLabel
  }

  const [hours, minutes] = event.start_time.split(':')
  const time = new Date()
  time.setHours(Number(hours), Number(minutes))
  const timeLabel = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return `${dateLabel} · ${timeLabel}`
}

// Prefer a human-friendly place name over the raw address in list contexts;
// the full address is still shown on the event detail page.
export function locationLabel(event: Event): string | null {
  return event.location_name ?? event.address
}

export function teaser(description: string | null, maxLength = 90): string | null {
  if (!description) return null
  if (description.length <= maxLength) return description
  return `${description.slice(0, maxLength).trimEnd()}…`
}
