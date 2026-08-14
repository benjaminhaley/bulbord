import { and, eq, isNull } from 'drizzle-orm'

import { createSession } from '../auth/service.js'
import { db } from '../db/client.js'
import { eventsLog, users } from '../db/schema.js'
import { requireEnv } from '../env.js'

// Short enough that a copied/scanned link doesn't become a standing
// credential (feedback #87: "please be sure that the link has an
// expiration like within an hour or so... don't want a bunch of stray
// login links floating around").
const IMPERSONATION_TTL_MS = 60 * 60 * 1000

// Reuses the exact ?signInToken= mechanism built for the App Review demo
// account (see CLAUDE.md's Login section) — a real session token delivered
// via URL, not a new auth path.
export function buildSignInUrl(webUrl: string, token: string): string {
  return `${webUrl}/?signInToken=${token}`
}

// Feedback #87: lets an admin generate a demo/impersonation link for any
// member, for cross-platform testing or showing the app off, without
// needing that member's own device. Returns null for an unknown/deleted
// target rather than throwing, so the route can turn it into a plain 404.
export async function impersonateUser(targetUserId: string, actingAdminId: string) {
  const [target] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.id, targetUserId), isNull(users.deletedAt)))
    .limit(1)

  if (!target) return null

  const { token, session } = await createSession(targetUserId, IMPERSONATION_TTL_MS)

  // Separate from createSession's own "session_created" log (actor: the
  // impersonated user) — this entry is what actually shows an admin
  // generated it, for audit purposes.
  await db.insert(eventsLog).values({
    actor: actingAdminId,
    action: 'user_impersonated',
    metadata: { targetUserId, targetName: target.name, sessionId: session.id },
  })

  return { url: buildSignInUrl(requireEnv('PUBLIC_WEB_URL'), token), expiresAt: session.expiresAt }
}
