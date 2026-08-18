// Pure authorization logic, kept dependency-free (no db/auth-plugin imports)
// so it's unit-testable without a database — own copy, mirroring
// camps/permissions.ts's shape rather than importing it (Sports & Clubs is a
// deliberately fresh, non-shared clone of both events and camps).

// A sports club's submitter can edit or delete it; no admin override, same
// creator-only posture as events'/camps' self-service posts.
export function canEditSportsClub(currentUser: { id: string }, sportsClub: { submittedByUserId: string | null }): boolean {
  return currentUser.id === sportsClub.submittedByUserId
}
