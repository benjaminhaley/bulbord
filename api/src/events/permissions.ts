// Pure authorization logic, kept dependency-free (no db/auth-plugin imports)
// so it's unit-testable without a database — same rationale as
// feedback/permissions.ts and comment-permissions.ts.

// An event's submitter can edit or delete it; no admin override, unlike
// comment deletion's moderation carve-out — feedback #46 asked for
// creator-only, matching how feedback-post edits work (feedback #39).
export function canEditEvent(currentUser: { id: string }, event: { submittedByUserId: string | null }): boolean {
  return currentUser.id === event.submittedByUserId
}
