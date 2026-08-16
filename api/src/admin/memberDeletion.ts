import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, users } from '../db/schema.js'

// Feedback #92 — "as super admin, I should have the ability to delete a
// member... both for testing and moderation reasons." Soft-delete only (see
// CLAUDE.md's recoverability rule): sets users.deletedAt, which every real
// user-lookup query already filters on (listUsersForAdmin, getSessionAndUser,
// connections suggestions/search, impersonateUser, etc.) — an active session
// for the deleted member stops resolving on its very next request, with no
// separate session-invalidation step needed. Their other rows (comments,
// posts, kids, event/camp interests, connections) are left as-is — same
// posture as the duplicate-account merge script's own soft-delete
// (api/src/auth/backfill-2026-08-05-merge-duplicate-anna.ts). This is a
// narrow "remove the account," not a cascading content purge; revisit if a
// real moderation need for the latter shows up.
export async function deleteMember(targetUserId: string, actingAdminId: string) {
  if (targetUserId === actingAdminId) {
    return { error: 'not_self' as const }
  }

  const [target] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.id, targetUserId), isNull(users.deletedAt)))
    .limit(1)

  if (!target) return { error: 'not_found' as const }

  await db.update(users).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, targetUserId))

  await db.insert(eventsLog).values({
    actor: actingAdminId,
    action: 'user_deleted',
    metadata: { targetUserId, targetName: target.name },
  })

  return { ok: true as const }
}
