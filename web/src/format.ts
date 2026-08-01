// Shared by FeedbackPage and the admin UsersPage — both just want a plain
// "Mon Day, Year" rendering of an ISO timestamp. Events has its own richer
// formatWhen() (start_time/all_day-aware) in web/src/events/format.ts; this
// is the plain one for everything else.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
