// Pure authorization logic, kept dependency-free (no db/auth-plugin imports)
// so it's unit-testable without a database — same rationale as
// events/comment-permissions.ts.

// A feedback post's author can edit it (title/description/photos); no admin
// override — feedback #39 asked for author-only, unlike comment deletion's
// moderation carve-out.
export function canEditFeedback(currentUser: { id: string }, feedback: { createdByUserId: string | null }): boolean {
  return currentUser.id === feedback.createdByUserId
}
