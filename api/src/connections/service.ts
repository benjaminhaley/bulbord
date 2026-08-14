import { and, eq, ilike, inArray, isNull, ne } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, userChildren, userConnections, users } from '../db/schema.js'
import { requireEnv } from '../env.js'
import { sendEmail } from '../newsletter/mailer.js'
import { buildSuggestionList, deriveConnectionsState, type ConnectionsState } from './logic.js'
import { connectionAlertHtml, connectionAlertSubject } from './template.js'

export interface MemberSummary {
  id: string
  name: string
  avatarUrl: string | null
}

export type { ConnectionsState }

const MEMBER_COLUMNS = { id: users.id, name: users.name, avatarUrl: users.avatarUrl }

// Every active (not soft-deleted) outgoing edge a user has added — "who
// they're following". Reused both by the onboarding suggestion algorithm's
// "inviter's own friends" step and by the "suggest their friends at the
// bottom" expansion once the viewer adds a suggested person (feedback #83).
export async function listOutgoingConnections(userId: string): Promise<MemberSummary[]> {
  return db
    .select(MEMBER_COLUMNS)
    .from(userConnections)
    .innerJoin(users, eq(users.id, userConnections.connectedUserId))
    .where(and(eq(userConnections.userId, userId), isNull(userConnections.deletedAt), isNull(users.deletedAt)))
}

async function listIncomingConnections(userId: string): Promise<MemberSummary[]> {
  return db
    .select(MEMBER_COLUMNS)
    .from(userConnections)
    .innerJoin(users, eq(users.id, userConnections.userId))
    .where(and(eq(userConnections.connectedUserId, userId), isNull(userConnections.deletedAt), isNull(users.deletedAt)))
}

// Powers the Friends page (feedback #83: "have a page where you can see
// friends and their state") — the mutual/one-directional split itself is
// pure logic, unit-tested in logic.test.ts; this just supplies the two raw
// edge queries.
export async function getConnectionsState(userId: string): Promise<ConnectionsState> {
  const [outgoing, incoming] = await Promise.all([listOutgoingConnections(userId), listIncomingConnections(userId)])
  return deriveConnectionsState(outgoing, incoming)
}

// One-directional add, instant, no approval needed (feedback #83 — mirrors
// event_interests' toggle-via-deletedAt shape: a pair gets at most one row,
// reactivated rather than re-inserted). Returns whether this call actually
// created/reactivated the edge (vs. a no-op repeat), since that's what
// decides whether the alert email below fires.
export async function addConnection(userId: string, connectedUserId: string): Promise<{ created: boolean }> {
  if (userId === connectedUserId) {
    throw new Error('cannot add yourself as a connection')
  }

  const [existing] = await db
    .select({ id: userConnections.id, deletedAt: userConnections.deletedAt })
    .from(userConnections)
    .where(and(eq(userConnections.userId, userId), eq(userConnections.connectedUserId, connectedUserId)))
    .limit(1)

  const wasActive = existing ? existing.deletedAt === null : false
  if (!existing) {
    await db.insert(userConnections).values({ userId, connectedUserId })
  } else if (!wasActive) {
    await db.update(userConnections).set({ deletedAt: null, updatedAt: new Date() }).where(eq(userConnections.id, existing.id))
  }

  const created = !wasActive
  if (created) {
    await db.insert(eventsLog).values({ actor: userId, action: 'connection_added', metadata: { connectedUserId } })
    // Best-effort — there's no in-app notification inbox (see schema.ts's
    // userConnections comment), so an alert email is the only way the other
    // person finds out to friend back. A failed send shouldn't undo the add.
    await notifyConnectionAdded(userId, connectedUserId).catch((err) => {
      console.error('connection alert email failed', err)
    })
  }
  return { created }
}

async function notifyConnectionAdded(adderId: string, recipientId: string) {
  const [[adder], [recipient]] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, adderId)).limit(1),
    db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, recipientId)).limit(1),
  ])
  if (!recipient?.email) return

  const webUrl = requireEnv('PUBLIC_WEB_URL')
  const adderName = adder?.name ?? 'Someone'
  await sendEmail(recipient.email, connectionAlertSubject(adderName), connectionAlertHtml(adderName, `${webUrl}/friends`))
}

// Onboarding suggestions (feedback #83): inviter, then the inviter's own
// connections, then other Family members with a kid in the same grade as
// one of the viewer's kids — in that order, deduped, excluding the viewer
// and anyone already connected. Search (connections/routes.ts's
// GET /connections/members) covers everyone else.
export async function getSuggestions(userId: string): Promise<MemberSummary[]> {
  const [[me], myKids, existingConnections] = await Promise.all([
    db.select({ invitedByUserId: users.invitedByUserId }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({ grade: userChildren.grade })
      .from(userChildren)
      .where(and(eq(userChildren.userId, userId), isNull(userChildren.deletedAt))),
    listOutgoingConnections(userId),
  ])

  const inviterId = me?.invitedByUserId
  const [inviterGroup, inviterConnectionsGroup] = inviterId
    ? await Promise.all([
        db
          .select(MEMBER_COLUMNS)
          .from(users)
          .where(and(eq(users.id, inviterId), isNull(users.deletedAt)))
          .limit(1),
        listOutgoingConnections(inviterId),
      ])
    : [[], []]

  const myGrades = [...new Set(myKids.map((kid) => kid.grade))]
  const gradeMatchGroup = myGrades.length
    ? await db
        .selectDistinct(MEMBER_COLUMNS)
        .from(userChildren)
        .innerJoin(users, eq(users.id, userChildren.userId))
        .where(and(inArray(userChildren.grade, myGrades), isNull(userChildren.deletedAt), isNull(users.deletedAt)))
    : []

  return buildSuggestionList(
    userId,
    [inviterGroup, inviterConnectionsGroup, gradeMatchGroup],
    existingConnections.map((c) => c.id),
  )
}

// "Search that allows you to find anyone else who might be a friend"
// (feedback #83) — name/avatar only, same exposure as the existing
// invited-by social graph (see CLAUDE.md's Data safety & classification).
export async function searchMembers(userId: string, query: string): Promise<MemberSummary[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  return db
    .select(MEMBER_COLUMNS)
    .from(users)
    .where(and(ilike(users.name, `%${trimmed}%`), ne(users.id, userId), isNull(users.deletedAt)))
    .orderBy(users.name)
    .limit(20)
}

export async function completeFriendsStep(userId: string) {
  const [updated] = await db
    .update(users)
    .set({ friendsStepCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()

  await db.insert(eventsLog).values({ actor: userId, action: 'friends_step_completed', metadata: {} })
  return updated
}
