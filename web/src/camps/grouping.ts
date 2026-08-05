// Pure helpers for working with the already-fetched by-break bucket
// structure GET /camps/by-break returns — no events equivalent, since events
// has no concept of a camp appearing in more than one section at once. A
// multi-week summer camp appears in every weekly bucket it overlaps (see
// api/src/camps/grouping.ts), so a cross-bucket state update needs to
// account for that duplication.

import type { BreakBucket, Camp } from './api'

// Applies an interest-status change to every occurrence of a camp across all
// buckets, not just the one the swipe happened in — a multi-week camp shown
// in 3 buckets must update in all 3, or the other two would silently show
// stale interest state.
export function applyInterestUpdateAcrossBuckets(buckets: BreakBucket[], campId: string, patch: Partial<Camp>): BreakBucket[] {
  return buckets.map((bucket) => ({
    ...bucket,
    camps: bucket.camps.map((camp) => (camp.id === campId ? { ...camp, ...patch } : camp)),
  }))
}
