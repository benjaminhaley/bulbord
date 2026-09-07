// Pure authorization logic, kept dependency-free (no db/auth-plugin imports)
// so it's unit-testable without a database — own copy, mirroring
// camps/permissions.ts's shape rather than importing it (Sports & Clubs is a
// deliberately fresh, non-shared clone of both events and camps).

// Any logged-in member can edit any sports club, including a seeded/system
// one with no submitter (feedback #141, 2026-09-07, reversing the original
// creator-only rule) — see events/permissions.ts's canEditEvent for the full
// reasoning.
export function canEditSportsClub(_currentUser: { id: string }, _sportsClub: { submittedByUserId: string | null }): boolean {
  return true
}

// Deletion stays creator-only, no admin override — see events/permissions.ts's
// canDeleteEvent for the full reasoning (#141 only asked for editability).
export function canDeleteSportsClub(currentUser: { id: string }, sportsClub: { submittedByUserId: string | null }): boolean {
  return currentUser.id === sportsClub.submittedByUserId
}
