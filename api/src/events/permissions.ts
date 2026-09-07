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

// Deletion stays creator-only, no admin override — #141 only asked for
// editability, not deletability, and a soft-delete is a materially more
// destructive, harder-to-notice-and-undo action than a field edit (which is
// always visible, attributed, and reversible via the edit history) — so it
// stays scoped to the original poster, same posture as feedback-post
// deletes. A system-sourced event (submittedByUserId null) still has no
// member delete path at all, unchanged from before this split.
export function canDeleteEvent(currentUser: { id: string }, event: { submittedByUserId: string | null }): boolean {
  return currentUser.id === event.submittedByUserId
}
