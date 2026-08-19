// Events (and, by extension, the newsletter that summarizes them) are
// Chicago-area, so "today" for date filtering is Chicago's calendar day, not
// the server's (typically UTC) one — using UTC would drop today's evening
// events a few hours early, or roll the newsletter's week boundary over too
// soon/late.
export function todayInChicago(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now)
}

// Plain date-string arithmetic (no further timezone conversion needed —
// the input is already a real calendar-day string, e.g. from
// todayInChicago() above) — used by events/routes.ts's next-7-days
// visibility rule (feedback #111).
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
