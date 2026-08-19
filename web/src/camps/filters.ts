// Pure, client-side filter predicate for Camps' new Age filter (feedback
// #103, 2026-08-19) — Camps had no filter UI at all before this, unlike
// Sports & Clubs/Events, so this is a fresh, minimal start rather than a
// port of anything. matchesAgeFilter itself is genuinely shared with
// Sports & Clubs (see ../gradeAges.ts) since it's one real rule, not a
// per-tab convention; this file exists so Camps still owns its own
// `Camp`-typed wiring, mirroring Sports & Clubs' own filters.ts shape.
import { matchesAgeFilter } from '../gradeAges'

export interface AgeFilterable {
  age_min: number | null
  age_max: number | null
}

export function matchesCampAgeFilter(camp: AgeFilterable, selectedAges: number[]): boolean {
  return matchesAgeFilter(camp.age_min, camp.age_max, selectedAges)
}
