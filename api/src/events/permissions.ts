// Pure authorization logic, kept dependency-free (no db/auth-plugin imports)
// so it's unit-testable without a database — same rationale as
// feedback/permissions.ts and comment-permissions.ts.

// Any logged-in member can edit any event, including a system-sourced one
// with no submitter (feedback #141, 2026-09-07, reversing the original
// creator-only rule) — the safety net is the edit-history mechanism
// (edit-history/service.ts) recording who changed what, not a restriction on
// who's allowed to. `requireAuth` on the route is what actually enforces
// "logged in" — this function's own params are unused (kept, `_`-prefixed,
// so every call site's existing shape doesn't need to change) so the
// permission stays a named, testable policy rather than being deleted
// outright and inlined as "just requireAuth."
export function canEditEvent(_currentUser: { id: string }, _event: { submittedByUserId: string | null }): boolean {
  return true
}

// Deletion stays creator-only, except for an admin override (feedback #164,
// 2026-09-14: "I should be able to delete any event camp club or sport as an
// admin. But others should only be able to delete ones that they added
// themselves.") — a soft-delete is still materially more destructive, harder-
// to-notice-and-undo than a field edit (always visible/attributed/reversible
// via edit history), so it stays scoped to the original poster for everyone
// else, same posture as feedback-post deletes. A system-sourced event
// (submittedByUserId null) still has no non-admin member delete path at all.
export function canDeleteEvent(
  currentUser: { id: string; roles: string[] },
  event: { submittedByUserId: string | null },
): boolean {
  return currentUser.roles.includes('admin') || currentUser.id === event.submittedByUserId
}
