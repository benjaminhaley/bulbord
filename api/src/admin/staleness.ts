// Feedback #69 — how stale events/camps data is, as a pure function so the
// actual comparison logic is unit-testable without a database. Accepts
// Date | string | null for each timestamp deliberately: drizzle's raw sql
// aggregate queries (see camps/staleness.ts, events/resourcing.ts) hand
// back whatever the underlying driver returns for a max(timestamp), which
// is a string at runtime despite the query's own sql<Date | null> type
// annotation only asserting the TS type, not converting it — a real bug
// caught by testing this against a live admin request (see CLAUDE.md's
// ship-and-verify convention) rather than trusting the type annotation.
export interface DataFreshness {
  eventsLastCheckedAt: Date | null
  campsLastUpdatedAt: Date | null
  oldestAt: Date | null
  isStale: boolean
}

function toDate(value: Date | string | null): Date | null {
  return value === null ? null : value instanceof Date ? value : new Date(value)
}

export function computeDataFreshness(
  eventsLastCheckedAtRaw: Date | string | null,
  campsLastUpdatedAtRaw: Date | string | null,
  staleAfterMs: number,
  now = new Date(),
): DataFreshness {
  const eventsLastCheckedAt = toDate(eventsLastCheckedAtRaw)
  const campsLastUpdatedAt = toDate(campsLastUpdatedAtRaw)
  const timestamps = [eventsLastCheckedAt, campsLastUpdatedAt]
  // A never-checked/never-updated side (null) is treated as maximally
  // stale, not ignored — there's no timestamp more concerning than "never".
  const oldestAt = timestamps.every((t) => t !== null)
    ? timestamps.reduce((oldest, t) => (t!.getTime() < oldest!.getTime() ? t : oldest))
    : null
  const isStale = oldestAt === null || now.getTime() - oldestAt.getTime() > staleAfterMs

  return { eventsLastCheckedAt, campsLastUpdatedAt, oldestAt, isStale }
}
