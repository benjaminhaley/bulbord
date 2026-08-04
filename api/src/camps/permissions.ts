// Pure authorization logic, kept dependency-free (no db/auth-plugin imports)
// so it's unit-testable without a database — own copy, mirroring
// events/permissions.ts's shape rather than importing it (camps is a
// deliberately fresh, non-shared clone — see CLAUDE.md feedback #50).

// A camp's submitter can edit or delete it; no admin override, same
// creator-only posture as events' self-service posts.
export function canEditCamp(currentUser: { id: string }, camp: { submittedByUserId: string | null }): boolean {
  return currentUser.id === camp.submittedByUserId
}
