import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { db } from '../db/client.js'
import { eventsLog, sessions, userChildren, userRoles, users } from '../db/schema.js'
import { hashToken, randomToken } from './tokens.js'

// Effectively unlimited (100 years) rather than a real "never expires" (which
// would need a nullable expiresAt column) — low-stakes MVP, favor staying
// logged in over re-auth friction. Logout still works via deletedAt.
const SESSION_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000

// ttlMs defaults to the effectively-unlimited session length above; a
// caller can override it for a deliberately short-lived session (e.g. an
// admin's impersonation link — see admin/impersonation.ts).
export async function createSession(userId: string, ttlMs: number = SESSION_TTL_MS) {
  const token = randomToken()
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMs),
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

export type UserRole = 'staff' | 'family' | 'other'
const USER_ROLES: UserRole[] = ['staff', 'family', 'other']

export type Grade = 'pre-k' | 'k' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'
const GRADES: Grade[] = ['pre-k', 'k', '1', '2', '3', '4', '5', '6', '7', '8']

export type ProfileUpdateInput = {
  name?: string
  email?: string
  avatarUrl?: string
  newsletterSubscribed?: boolean
  role?: UserRole
  roleOther?: string
  kids?: { grade: Grade }[]
}
type ValidationResult =
  | { ok: true; updates: ProfileUpdateInput }
  | { ok: false; message: string }

// Validates a PATCH /auth/me body before it reaches updateProfile — pulled
// out as a pure function (rather than left inline in the route handler) so
// the signup-flow's field requirements, the actual business rules here, are
// unit-testable without spinning up Fastify. Email, role, avatar, and (for
// Family) kids are only required the first time a profile is completed (the
// signup flow) — later edits to just the name, say, shouldn't force any of
// them.
export function validateProfileUpdate(current: { profileComplete: boolean }, body: ProfileUpdateInput): ValidationResult {
  const name = body.name?.trim()
  if (body.name !== undefined && !name) {
    return { ok: false, message: 'name cannot be blank' }
  }

  const email = body.email?.trim()
  if (body.email !== undefined && !email) {
    return { ok: false, message: 'email cannot be blank' }
  }
  if (email !== undefined && !email.includes('@')) {
    return { ok: false, message: 'email must be a valid email address' }
  }

  if (body.role !== undefined && !USER_ROLES.includes(body.role)) {
    return { ok: false, message: 'role must be staff, family, or other' }
  }
  const roleOther = body.roleOther?.trim()
  if (body.role === 'other' && !roleOther) {
    return { ok: false, message: 'please describe your role' }
  }

  if (body.kids?.some((kid) => !GRADES.includes(kid.grade))) {
    return { ok: false, message: 'grade must be a valid school grade' }
  }

  const completingProfile = !!name && !current.profileComplete
  if (completingProfile && !email) {
    return { ok: false, message: 'email is required to complete your profile' }
  }
  if (completingProfile && !body.role) {
    return { ok: false, message: 'role is required to complete your profile' }
  }
  // Photo required (feedback #82): Nettelhorst Bulbord is invite-only, and a
  // photo is part of how another member can tell this new account is really
  // who they say they are — same reasoning ProfileSetupScreen's under-Continue
  // explainer text shows on the client.
  if (completingProfile && !body.avatarUrl) {
    return { ok: false, message: 'a photo is required to complete your profile' }
  }
  // Kids/grade required for Family only (feedback #81) — Staff/Other members
  // have no kids to enter.
  if (completingProfile && body.role === 'family' && !body.kids?.length) {
    return { ok: false, message: 'at least one kid is required to complete your profile' }
  }

  return {
    ok: true,
    updates: {
      name,
      email,
      avatarUrl: body.avatarUrl,
      newsletterSubscribed: body.newsletterSubscribed,
      role: body.role,
      roleOther: body.role === 'other' ? roleOther : undefined,
      kids: body.role === 'family' ? body.kids : undefined,
    },
  }
}

// Post-registration "set up your profile" step — the only place a user's
// name/photo are ever set after the placeholder assigned at registration.
export async function updateProfile(userId: string, updates: ProfileUpdateInput) {
  const [[updated]] = await Promise.all([
    db
      .update(users)
      .set({
        ...(updates.name ? { name: updates.name, profileCompletedAt: new Date() } : {}),
        ...(updates.email ? { email: updates.email } : {}),
        ...(updates.avatarUrl ? { avatarUrl: updates.avatarUrl } : {}),
        ...(updates.newsletterSubscribed !== undefined ? { newsletterSubscribed: updates.newsletterSubscribed } : {}),
        ...(updates.role ? { role: updates.role, roleOther: updates.roleOther ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning(),
    db.insert(eventsLog).values({ actor: userId, action: 'profile_updated', metadata: {} }),
  ])

  // Full replace, same posture as feedback_images (feedback #40) — the
  // profile-setup form resends the complete desired set, so there's no
  // add/remove list to reconcile, just soft-delete the old rows (if any —
  // there won't be, on first completion) and insert the new set fresh.
  if (updates.kids) {
    await db
      .update(userChildren)
      .set({ deletedAt: new Date() })
      .where(and(eq(userChildren.userId, userId), isNull(userChildren.deletedAt)))
    if (updates.kids.length) {
      await db.insert(userChildren).values(updates.kids.map((kid) => ({ userId, grade: kid.grade })))
    }
  }

  return updated
}

// Powers GET /auth/me's `kids` field so a member can see/edit their own
// onboarding info later, not just set it once at signup (feedback,
// 2026-08-14: "I should be able to see and edit... all onboarding
// information in my profile").
export async function listUserChildren(userId: string) {
  return db
    .select({ grade: userChildren.grade })
    .from(userChildren)
    .where(and(eq(userChildren.userId, userId), isNull(userChildren.deletedAt)))
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
      newsletterSubscribed: users.newsletterSubscribed,
      role: users.role,
      roleOther: users.roleOther,
    })
    .from(users)
    .leftJoin(inviter, eq(inviter.id, users.invitedByUserId))
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt))
}
