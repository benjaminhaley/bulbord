// Pure, dependency-free sort/visibility logic for the Sports & Clubs flat
// list — no events/camps equivalent, since this tab's schedule shape is
// genuinely new (see CLAUDE.md's Sports & Clubs section). Computed in
// TypeScript rather than SQL, same "small dataset, no pagination pressure"
// reasoning camps/grouping.ts documents for its own break-bucket grouping.
//
// The core wrinkle: a 'fixed_session' listing (a real cohort with its own
// first/last day — a dance term, a sports season) sorts by its own firstDate
// and is hidden by default once that date has passed, even while it's still
// running — a member browsing "what can I sign up for" shouldn't see a
// session that's already underway cluttering the top of the list, but it's
// not gone forever (see hiddenByDefault below, surfaced via a "Show N
// already-started" reveal row, same pattern as Events'/Camps' existing
// reveal rows). An 'ongoing' listing (a standing weekly club you can join
// anytime, no announced end) has no cohort to be "late" for — it sorts by
// its own next upcoming occurrence instead, and is never hidden for having
// started, since "started" doesn't mean anything for it.

export interface SportsClubSortInput {
  id: string
  scheduleType: string // 'fixed_session' | 'ongoing'
  firstDate: string | null // YYYY-MM-DD
  lastDate: string | null
  // Earliest sports_club_occurrences.date >= today for this listing, or null
  // if none has been generated/confirmed — computed by the caller's query.
  nextOccurrenceDate: string | null
}

export interface SportsClubSortResult {
  // The date this listing sorts by in the flat list — a fixed_session's own
  // firstDate (falling back to nextOccurrenceDate if firstDate is somehow
  // unknown, so it still sorts somewhere sensible rather than being lost to
  // a null), or an ongoing listing's next upcoming occurrence.
  effectiveSortDate: string | null
  // True only for a fixed_session whose firstDate has already passed but
  // that's still relevant (not concluded) — never true for 'ongoing'.
  hiddenByDefault: boolean
  // False only once there's positive evidence a listing is over (a known
  // lastDate in the past). Defaults to true otherwise — deliberately NOT
  // gated on having any generated occurrence rows: a member self-service
  // post never gets occurrence rows at all (see CLAUDE.md's "self-service
  // stays simple" precedent), so requiring one here would silently hide
  // every member-submitted listing that didn't also set a lastDate. A
  // hand-seeded listing whose occurrence-generation window has simply gone
  // stale is a data-freshness problem to fix at the source (regenerate the
  // window), not something this function should paper over by disappearing
  // the listing.
  relevant: boolean
}

export function computeSportsClubSort(club: SportsClubSortInput, today: string): SportsClubSortResult {
  const relevant = club.lastDate === null || club.lastDate >= today

  if (club.scheduleType === 'ongoing') {
    return { effectiveSortDate: club.nextOccurrenceDate, hiddenByDefault: false, relevant }
  }

  return {
    effectiveSortDate: club.firstDate ?? club.nextOccurrenceDate,
    hiddenByDefault: relevant && club.firstDate !== null && club.firstDate < today,
    relevant,
  }
}

// Filters out no-longer-relevant listings, annotates the rest with sort/hide
// info, and sorts by effectiveSortDate ascending (a listing with no date at
// all sorts last, rather than floating unpredictably to the top via a null
// comparison). Callers decide whether to include hiddenByDefault rows (the
// "Show N already-started" reveal) — this function always returns the full
// relevant set, annotated, so the caller/frontend can compute the hidden
// count itself rather than this function baking in a fixed reveal policy.
export function sortSportsClubs<T extends SportsClubSortInput>(
  clubs: T[],
  today: string,
): Array<T & SportsClubSortResult> {
  return clubs
    .map((club) => ({ ...club, ...computeSportsClubSort(club, today) }))
    .filter((club) => club.relevant)
    .sort((a, b) => {
      if (a.effectiveSortDate === b.effectiveSortDate) return 0
      if (a.effectiveSortDate === null) return 1
      if (b.effectiveSortDate === null) return -1
      return a.effectiveSortDate < b.effectiveSortDate ? -1 : 1
    })
}
