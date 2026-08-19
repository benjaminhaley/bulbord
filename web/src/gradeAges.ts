// Shared grade-to-age mapping (feedback #103, 2026-08-19: "by default this
// filter should be on and should select the ages appropriate for your kid
// based on the grade level you selected — be permissive, so if you selected
// second grade, then please select both seven and eight since you might be
// either of those ages"). Genuinely shared infra, like dayLabel.ts — the
// underlying rule ("what ages can a kid in grade X be") is one real fact
// about the world, not a per-tab convention, so it's not duplicated the way
// Camps/Sports & Clubs otherwise keep separate copies of everything
// (CLAUDE.md's "fresh, non-shared clone" posture). Used by both Camps'
// and Sports & Clubs' age filters, each of which still keeps its own
// filters.ts predicate wired to its own listing type.
import type { Grade } from './auth/api'

// A kid in a given school grade could be either of two ages during the
// school year depending on their birthday relative to the fall cutoff —
// both are included so the default filter never excludes a real possible
// age for that kid. Matches the grade options already used at signup
// (web/src/auth/profileForm.tsx's GRADE_OPTIONS).
const PERMISSIVE_AGES: Record<Grade, readonly [number, number]> = {
  // Corrected 2026-08-19, per Ben directly: at Nettelhorst, pre-K is 4-5,
  // not 3-4 — every other grade's mapping below was already right.
  'pre-k': [4, 5],
  k: [5, 6],
  '1': [6, 7],
  '2': [7, 8],
  '3': [8, 9],
  '4': [9, 10],
  '5': [10, 11],
  '6': [11, 12],
  '7': [12, 13],
  '8': [13, 14],
}

export function permissiveAgesForGrade(grade: Grade): number[] {
  return [...PERMISSIVE_AGES[grade]]
}

// The union of every kid's own permissive ages, deduped and sorted — a
// household with kids in different grades should default to a filter that
// covers all of them, not just one.
export function defaultAgesForKids(kids: { grade: Grade }[]): number[] {
  const ages = new Set<number>()
  for (const kid of kids) {
    for (const age of permissiveAgesForGrade(kid.grade)) ages.add(age)
  }
  return [...ages].sort((a, b) => a - b)
}

// A listing with no known age range at all is excluded once an age filter
// is active (feedback, 2026-08-19: "Team Training should not show up here
// given that I have age filtering on... filter should not patch the case.
// This is kind of a universal rule.") — same reversal Sports & Clubs'
// Day/Time filter already got for feedback #106: an active filter can't
// confirm a listing satisfies it, so showing it anyway is a guess, not a
// real match. A listing with only one bound known (e.g. "12+") still
// matches any selected age on the open side of that bound — that's real,
// if partial, data, not the "nothing known at all" case this excludes.
export function matchesAgeFilter(ageMin: number | null, ageMax: number | null, selectedAges: number[]): boolean {
  if (selectedAges.length === 0) return true
  if (ageMin == null && ageMax == null) return false
  return selectedAges.some((age) => (ageMin == null || age >= ageMin) && (ageMax == null || age <= ageMax))
}
