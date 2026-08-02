// Events (and, by extension, the newsletter that summarizes them) are
// Chicago-area, so "today" for date filtering is Chicago's calendar day, not
// the server's (typically UTC) one — using UTC would drop today's evening
// events a few hours early, or roll the newsletter's week boundary over too
// soon/late.
export function todayInChicago(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now)
}
