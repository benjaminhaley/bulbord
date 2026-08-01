import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { db } from '../db/client.js'
import { eventsLog, sessions, userRoles, users } from '../db/schema.js'
import { hashToken, randomToken } from './tokens.js'

// Effectively unlimited (100 years) rather than a real "never expires" (which
// would need a nullable expiresAt column) — low-stakes MVP, favor staying
// logged in over re-auth friction. Logout still works via deletedAt.
const SESSION_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000

export async function createSession(userId: string) {
  const token = randomToken()
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    .returning()

  await db.insert(eventsLog).values({
    actor: userId,
    action: 'session_created',
    metadata: { sessionId: session.id },
  })

  return { token, session }
}

export async function resolveSessionUser(bearerToken: string) {
  const tokenHash = hashToken(bearerToken)
  const rows = await db
    .select({ user: users, role: userRoles.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(userRoles, and(eq(userRoles.userId, users.id), isNull(userRoles.deletedAt)))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.deletedAt),
        gt(sessions.expiresAt, new Date()),
        isNull(users.deletedAt),
      ),
    )

  const [first] = rows
  if (!first) return null

  const roles = rows.map((r) => r.role).filter((role) => role !== null)
  return { user: first.user, roles }
}

export async function revokeSession(bearerToken: string) {
  const tokenHash = hashToken(bearerToken)
  const [session] = await db
    .update(sessions)
    .set({ deletedAt: new Date() })
    .where(eq(sessions.tokenHash, tokenHash))
    .returning()

  if (session) {
    await db.insert(eventsLog).values({
      actor: session.userId,
      action: 'session_revoked',
      metadata: { sessionId: session.id },
    })
  }
}

// Post-registration "set up your profile" step — the only place a user's
// name/photo are ever set after the placeholder assigned at registration.
export async function updateProfile(userId: string, updates: { name?: string; avatarUrl?: string }) {
  const [updated] = await db
    .update(users)
    .set({
      ...(updates.name ? { name: updates.name, profileCompletedAt: new Date() } : {}),
      ...(updates.avatarUrl ? { avatarUrl: updates.avatarUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning()

  await db.insert(eventsLog).values({ actor: userId, action: 'profile_updated', metadata: {} })

  return updated
}

// Minimal public lookup so a non-member's join screen can show "X invited
// you" without exposing anything beyond a name/photo (see CLAUDE.md's Data
// safety rules — this is the one deliberate exception, same as the existing
// "who from school is going" social-proof carve-out).
export async function getPublicInviteInfo(userId: string) {
  const [row] = await db
    .select({ name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1)

  return row ?? null
}

// First admin view in the app (see CLAUDE.md's Introspectability section) —
// every user with who invited them, for the basic social graph.
export async function listUsersForAdmin() {
  const inviter = alias(users, 'inviter')
  return db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      invitedByName: inviter.name,
    })
    .from(users)
    .leftJoin(inviter, eq(inviter.id, users.invitedByUserId))
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt))
}
