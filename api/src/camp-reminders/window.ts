// Pure, dependency-free due-date logic for feedback #120's "day off camp"
// reminder email — kept separate from query.ts's DB plumbing the same way
// camps/grouping.ts's bucket math is kept separate from camps/routes.ts, so
// the actual "is this reminder due" rule can be unit-tested exhaustively
// without a database.

const REMINDER_LEAD_DAYS = 28

function parseDateUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`)
}

function formatDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = parseDateUTC(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return formatDateUTC(d)
}

// The reminder should go out four weeks before a break starts (feedback
// #120: "four weeks before a day off of CPS... we should send an email").
export function reminderDateFor(startDate: string): string {
  return addDays(startDate, -REMINDER_LEAD_DAYS)
}

// remindedAt (school_breaks.remindedAt) is the dedup guard — once a break's
// reminder has actually been sent, it's never sent again for that break, no
// matter how many more times the daily cron runs. Before that, `today >=
// reminderDateFor(startDate)` fires on the exact due day under normal
// operation, but also self-heals if a cron run was missed (a deploy outage,
// same class of gap the recurring-series-health.ts staleness detector
// exists to catch) — the reminder still goes out on the next run, as long
// as the break itself hasn't already fully passed (see the caller's own
// endDate >= today filter in query.ts's getCandidateBreaks).
export function isReminderDue(today: string, startDate: string, remindedAt: Date | null): boolean {
  if (remindedAt !== null) return false
  return today >= reminderDateFor(startDate)
}
