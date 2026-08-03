// Shared by FeedbackPage and the admin UsersPage — both just want a plain
// "Mon Day, Year" rendering of an ISO timestamp. Events has its own richer
// formatWhen() (start_time/all_day-aware) in web/src/events/format.ts; this
// is the plain one for everything else.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// "Today at 4:57 PM" / "Yesterday" / "Aug 3, 2026" — for a "when did this
// last happen" timestamp (e.g. Developer Tools' "sources last checked"),
// where the exact time only matters if it was today. Same short-month/day
// style as formatDate for anything older than yesterday, so date rendering
// stays consistent across the app rather than inventing a second style.
export function formatRelativeDateTime(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfDate = new Date(date)
  startOfDate.setHours(0, 0, 0, 0)
  const diffDays = Math.round((startOfDate.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000))

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  if (diffDays === -1) return 'Yesterday'
  return formatDate(iso)
}
