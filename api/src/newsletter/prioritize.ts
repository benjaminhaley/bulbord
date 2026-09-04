import type { WeeklyEvent } from './query.js'

export interface WeeklyEventCandidate extends WeeklyEvent {
  // Whether this event's series has more than one occurrence anywhere in
  // the events table (past or future), not just within the newsletter's own
  // one-week window — a weekly series only ever has one occurrence inside
  // any single week, so "recurring" can't be determined from the week's own
  // candidate list alone. See query.ts's own comment on how this is computed.
  isRecurring: boolean
}

const MAX_NEWSLETTER_EVENTS = 10

// Feedback #143 (2026-09-04), "recurring events should not appear in the
// weekly email unless you've run out of non-recurring events to show
// first... after that, priority should be on events people have expressed
// interest in... after that, just grab a random selection": a recurring
// series (the Bike Bus every Friday, the French Market every Saturday)
// otherwise crowds out one-time events just by having a next occurrence
// that happens to fall this week — a member already sees those on the
// Events tab every week regardless, so the newsletter's limited slots are
// more useful spent surfacing what's new.
//
// candidates is assumed already in the query's own chronological order
// (soonest first) — that order is preserved for the non-recurring tier,
// since nothing in the feedback asked to change how one-time events are
// ordered among themselves. `random` is injectable for deterministic tests;
// production calls this with the real Math.random.
export function prioritizeNewsletterEvents(candidates: WeeklyEventCandidate[], random: () => number = Math.random): WeeklyEvent[] {
  const nonRecurring = candidates.filter((c) => !c.isRecurring)
  const recurring = candidates
    .filter((c) => c.isRecurring)
    .map((c) => ({ event: c, tiebreak: random() }))
    .sort((a, b) => b.event.interestedCount - a.event.interestedCount || a.tiebreak - b.tiebreak)
    .map((entry) => entry.event)

  return [...nonRecurring, ...recurring].slice(0, MAX_NEWSLETTER_EVENTS).map(({ isRecurring: _isRecurring, ...event }) => event)
}
