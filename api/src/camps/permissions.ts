// Pure authorization logic, kept dependency-free (no db/auth-plugin imports)
// so it's unit-testable without a database — own copy, mirroring
// events/permissions.ts's shape rather than importing it (camps is a
// deliberately fresh, non-shared clone — see CLAUDE.md feedback #50).

// Any logged-in member can edit any camp, including a seeded/system one with
// no submitter (feedback #141, 2026-09-07, reversing the original
// creator-only rule) — see events/permissions.ts's identical comment for the
// full reasoning (the edit-history mechanism is the safety net now, not a
// restriction on who's allowed to edit).
export function canEditCamp(_currentUser: { id: string }, _camp: { submittedByUserId: string | null }): boolean {
  return true
}

// Deletion stays creator-only, no admin override — see events/permissions.ts's
// canDeleteEvent for the full reasoning (#141 only asked for editability).
export function canDeleteCamp(currentUser: { id: string }, camp: { submittedByUserId: string | null }): boolean {
  return currentUser.id === camp.submittedByUserId
}
