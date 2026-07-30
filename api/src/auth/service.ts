import { and, eq, gt, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { authIdentities, eventsLog, loginCodes, sessions, userRoles, users } from '../db/schema.js'
import { hashToken, randomToken } from './tokens.js'
import type { FacebookProfile } from './facebook.js'

// Effectively unlimited (100 years) rather than a real "never expires" (which
// would need a nullable expiresAt column) — low-stakes MVP, favor staying
// logged in over re-auth friction. Logout still works via deletedAt.
const SESSION_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000
const LOGIN_CODE_TTL_MS = 2 * 60 * 1000 // 2 minutes

interface IdentityProfile {
  name: string
  email: string | null
  avatarUrl: string | null
}

async function findOrCreateUserByIdentity(provider: string, providerUserId: string, profile: IdentityProfile) {
  const [existing] = await db
    .select({ user: users })
    .from(authIdentities)
    .innerJoin(users, eq(users.id, authIdentities.userId))
    .where(
      and(
        eq(authIdentities.provider, provider),
        eq(authIdentities.providerUserId, providerUserId),
        isNull(authIdentities.deletedAt),
      ),
    )
    .limit(1)

  if (existing) return existing.user

  const [user] = await db
    .insert(users)
    .values({ name: profile.name, email: profile.email, avatarUrl: profile.avatarUrl })
    .returning()

  await db.insert(authIdentities).values({ userId: user.id, provider, providerUserId })

  await db.insert(eventsLog).values({
    actor: user.id,
    action: 'user_created',
    metadata: { provider },
  })

  return user
}

export async function findOrCreateUserFromFacebook(profile: FacebookProfile) {
  return findOrCreateUserByIdentity('facebook', profile.id, profile)
}

// Stopgap admin login while Facebook OAuth is unavailable (see CLAUDE.md).
// Gated by a single shared secret (ADMIN_LOGIN_PASSWORD) checked in routes.ts —
// reaching this function at all means that check already passed.
export async function findOrCreateAdminBootstrapUser() {
  const user = await findOrCreateUserByIdentity('password', 'admin-bootstrap', {
    name: 'Ben (temporary login)',
    email: null,
    avatarUrl: null,
  })

  const [existingRole] = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, user.id), eq(userRoles.role, 'admin'), isNull(userRoles.deletedAt)))
    .limit(1)

  if (!existingRole) {
    await db.insert(userRoles).values({ userId: user.id, role: 'admin' })
    await db.insert(eventsLog).values({ actor: user.id, action: 'role_granted', metadata: { role: 'admin' } })
  }

  return user
}

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

export async function createLoginCode(sessionId: string, sessionToken: string) {
  const code = randomToken(16)
  await db.insert(loginCodes).values({
    codeHash: hashToken(code),
    sessionId,
    sessionToken,
    expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS),
  })
  return code
}

export async function consumeLoginCode(code: string): Promise<string | null> {
  const codeHash = hashToken(code)
  const [row] = await db
    .select()
    .from(loginCodes)
    .where(and(eq(loginCodes.codeHash, codeHash), isNull(loginCodes.deletedAt), gt(loginCodes.expiresAt, new Date())))
    .limit(1)

  if (!row) return null

  await db.update(loginCodes).set({ deletedAt: new Date() }).where(eq(loginCodes.id, row.id))

  return row.sessionToken
}

export async function resolveSessionUser(bearerToken: string) {
  const tokenHash = hashToken(bearerToken)
  const rows = await db
    .select({ user: users, role: userRoles.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(userRoles, and(eq(userRoles.userId, users.id), isNull(userRoles.deletedAt)))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.deletedAt), gt(sessions.expiresAt, new Date())))

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
