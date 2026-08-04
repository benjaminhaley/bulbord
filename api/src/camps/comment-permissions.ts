// Pure authorization logic, kept dependency-free — own copy, mirroring
// events/comment-permissions.ts (camps is a fresh, non-shared clone).

// A comment's author can always edit/delete their own; an admin can also
// delete (moderation) but not edit someone else's words for them.
export function canEditComment(currentUser: { id: string }, comment: { userId: string }): boolean {
  return currentUser.id === comment.userId
}

export function canDeleteComment(currentUser: { id: string; roles: string[] }, comment: { userId: string }): boolean {
  return currentUser.id === comment.userId || currentUser.roles.includes('admin')
}
