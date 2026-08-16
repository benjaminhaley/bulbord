// Pure authorization logic, kept dependency-free (no db/auth-plugin imports)
// so it's unit-testable without a database — same rationale as
// events/comment-permissions.ts, which this mirrors exactly.

// A comment's author can always edit/delete their own; an admin can also
// delete (moderation) but not edit someone else's words for them.
export function canEditFeedbackComment(currentUser: { id: string }, comment: { userId: string }): boolean {
  return currentUser.id === comment.userId
}

export function canDeleteFeedbackComment(currentUser: { id: string; roles: string[] }, comment: { userId: string }): boolean {
  return currentUser.id === comment.userId || currentUser.roles.includes('admin')
}
