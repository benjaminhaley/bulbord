import { and, eq, ilike, inArray, isNull, ne } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, userChildren, userConnections, users } from '../db/schema.js'
import { requireEnv } from '../env.js'
import { sendEmail } from '../newsletter/mailer.js'
import { createNotification } from '../notifications/service.js'
import { buildSuggestionList, deriveConnectionsState, type ConnectionEdge, type ConnectionsState } from './logic.js'
import { connectionRequestHtml, connectionRequestSubject } from './template.js'

export interface MemberSummary {
  id: string
  name: string
  avatarUrl: string | null
}

export type { ConnectionsState }

const MEMBER_COLUMNS = { id: users.id, name: users.name, avatarUrl: users.avatarUrl }
// Excludes operational accounts (today, just Apple App Review) from every
// discovery surface below — feedback, 2026-08-14, after it showed up as a
// friend suggestion. See schema.ts's isServiceAccount comment.
const NOT_SERVICE_ACCOUNT = eq(users.isServiceAccount, false)

// A user's real, *accepted* friends only — used wherever "who does this
// person actually know" matters (onboarding suggestions' "inviter's own
// friends" tier, and "suggest their friends at the bottom of the list"
// after adding someone) — a still-pending request isn't a real connection
// yet, so it's deliberately excluded here.
export async function listAcceptedConnections(userId: string): Promise<MemberSummary[]> {
  return db
    .select(MEMBER_COLUMNS)
    .from(userConnections)
    .innerJoin(users, eq(users.id, userConnections.connectedUserId))
    .where(
      and(
        eq(userConnections.userId, userId),
        eq(userConnections.status, 'accepted'),
        isNull(userConnections.deletedAt),
        isNull(users.deletedAt),
      ),
    )
}

// Every active edge (either status) with the requester on `userId`'s side —
// the raw building block for both halves of ConnectionsState and for the
// "don't suggest someone I already have a pending or accepted edge with"
// exclusion list.
async function listOutgoingEdges(userId: string): Promise<ConnectionEdge[]> {
  const rows = await db
    .select({
      connectionId: userConnections.id,
      status: userConnections.status,
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(userConnections)
    .innerJoin(users, eq(users.id, userConnections.connectedUserId))
    .where(and(eq(userConnections.userId, userId), isNull(userConnections.deletedAt), isNull(users.deletedAt)))
  return rows.map((r) => ({
    connectionId: r.connectionId,
    status: r.status as 'pending' | 'accepted',
    member: { id: r.id, name: r.name, avatarUrl: r.avatarUrl },
  }))
}

async function listIncomingEdges(userId: string): Promise<ConnectionEdge[]> {
  const rows = await db
    .select({
      connectionId: userConnections.id,
      status: userConnections.status,
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(userConnections)
    .innerJoin(users, eq(users.id, userConnections.userId))
    .where(and(eq(userConnections.connectedUserId, userId), isNull(userConnections.deletedAt), isNull(users.deletedAt)))
  return rows.map((r) => ({
    connectionId: r.connectionId,
    status: r.status as 'pending' | 'accepted',
    member: { id: r.id, name: r.name, avatarUrl: r.avatarUrl },
  }))
}

// Powers the Friends page (feedback #83, reworked into a real request/
// accept model by feedback #127) — the three-bucket split itself is pure
// logic, unit-tested in logic.test.ts; this just supplies the two raw edge
// queries.
export async function getConnectionsState(userId: string): Promise<ConnectionsState> {
  const [outgoing, incoming] = await Promise.all([listOutgoingEdges(userId), listIncomingEdges(userId)])
  return deriveConnectionsState(outgoing, incoming)
}

// Real friend-request semantics (feedback #127, 2026-09-03 — reverses the
// original 2026-08-14 "instant, no approval needed" design): sending a
// request creates a 'pending' row; it only becomes a real friendship once
// the recipient explicitly accepts (see acceptConnection below). If the
// target already sent *me* a pending request, this call is really an
// accept of *their* request, not a second competing row — same as two
// people adding each other used to silently become "Friends" under the old
// model, just expressed as accept rather than a second insert.
export async function requestConnection(
  userId: string,
  targetId: string,
): Promise<{ status: 'pending' | 'accepted' }> {
  if (userId === targetId) {
    throw new Error('cannot add yourself as a connection')
  }

  const [reverseEdge] = await db
    .select({ id: userConnections.id, status: userConnections.status })
    .from(userConnections)
    .where(and(eq(userConnections.userId, targetId), eq(userConnections.connectedUserId, userId), isNull(userConnections.deletedAt)))
    .limit(1)

  if (reverseEdge?.status === 'pending') {
    await acceptConnectionRow(reverseEdge.id, targetId, userId)
    return { status: 'accepted' }
  }
  if (reverseEdge?.status === 'accepted') {
    return { status: 'accepted' } // already friends, no-op
  }

  const [existing] = await db
    .select({ id: userConnections.id, status: userConnections.status, deletedAt: userConnections.deletedAt })
    .from(userConnections)
    .where(and(eq(userConnections.userId, userId), eq(userConnections.connectedUserId, targetId)))
    .limit(1)

  if (existing && !existing.deletedAt) {
    return { status: existing.status as 'pending' | 'accepted' } // already requested (or already friends) — no-op
  }

  if (existing) {
    await db
      .update(userConnections)
      .set({ deletedAt: null, status: 'pending', updatedAt: new Date() })
      .where(eq(userConnections.id, existing.id))
  } else {
    await db.insert(userConnections).values({ userId, connectedUserId: targetId, status: 'pending' })
  }

  await db.insert(eventsLog).values({ actor: userId, action: 'connection_requested', metadata: { targetId } })
  // Best-effort — a failed send shouldn't undo the request.
  await notifyConnectionRequested(userId, targetId).catch((err) => {
    console.error('connection request alert email failed', err)
  })
  return { status: 'pending' }
}

// Shared by acceptConnection (the recipient tapping Accept) and
// requestConnection's auto-accept case (sending a request to someone who
// already requested you) — the actual row update + notification, keyed by
// the pending row's own id rather than re-deriving it, since both callers
// already know it.
async function acceptConnectionRow(connectionId: string, requesterId: string, recipientId: string): Promise<void> {
  await db
    .update(userConnections)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(eq(userConnections.id, connectionId))

  await db.insert(eventsLog).values({ actor: recipientId, action: 'connection_accepted', metadata: { requesterId } })

  // The requester is the one with news here — they sent a request and it
  // just got accepted. No email counterpart (in-app only), same
  // minimal-noise posture the old model already had for a reciprocal
  // completion that isn't a surprise to anyone.
  const [requester] = await db.select({ name: users.name }).from(users).where(eq(users.id, recipientId)).limit(1)
  const recipientName = requester?.name ?? 'Someone'
  await createNotification({
    userId: requesterId,
    type: 'friend_request_accepted',
    actorUserId: recipientId,
    message: `${recipientName} accepted your friend request`,
    targetPath: '/friends',
  })
}

// Recipient-only — a request can only be accepted or declined by the
// person it was sent to. Returns false (rather than throwing) for a
// not-found/not-pending/not-yours id so the route can 404 cleanly.
export async function acceptConnection(userId: string, connectionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: userConnections.id, userId: userConnections.userId })
    .from(userConnections)
    .where(
      and(
        eq(userConnections.id, connectionId),
        eq(userConnections.connectedUserId, userId),
        eq(userConnections.status, 'pending'),
        isNull(userConnections.deletedAt),
      ),
    )
    .limit(1)
  if (!row) return false

  await acceptConnectionRow(row.id, row.userId, userId)
  return true
}

// Soft-deletes the pending row rather than a third status value, so the
// same person can send a fresh request later — same toggle convention as
// every other deletedAt-toggled table in this codebase. Deliberately
// silent (no notification back to the requester), matching the ordinary
// social norm around a declined request.
export async function declineConnection(userId: string, connectionId: string): Promise<boolean> {
  const [updated] = await db
    .update(userConnections)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(userConnections.id, connectionId),
        eq(userConnections.connectedUserId, userId),
        eq(userConnections.status, 'pending'),
        isNull(userConnections.deletedAt),
      ),
    )
    .returning({ id: userConnections.id })
  if (!updated) return false

  await db.insert(eventsLog).values({ actor: userId, action: 'connection_declined', metadata: { connectionId } })
  return true
}

async function notifyConnectionRequested(requesterId: string, recipientId: string) {
  const [[requester], [recipient]] = await Promise.all([
    db.select({ name: users.name, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, requesterId)).limit(1),
    db
      .select({ name: users.name, email: users.email, notifyEmail: users.notifyFriendAddedEmail })
      .from(users)
      .where(eq(users.id, recipientId))
      .limit(1),
  ])
  const requesterName = requester?.name ?? 'Someone'

  // In-app entry always created (feedback #100: the notification list is
  // the inbox itself, not an optional channel — only Email is toggleable).
  await createNotification({
    userId: recipientId,
    type: 'friend_added',
    actorUserId: requesterId,
    message: `${requesterName} sent you a friend request`,
    targetPath: '/friends',
  })

  if (!recipient?.email || !recipient.notifyEmail) return

  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')
  await sendEmail(
    recipient.email,
    connectionRequestSubject(requesterName),
    connectionRequestHtml(requesterName, requester?.avatarUrl ?? null, apiUrl, `${webUrl}/friends`),
  )
}

// Cap on the default (no search query) suggestions list — "up to whatever
// reasonable... two hundred at a shot" (feedback, 2026-08-14). Search
// (GET /connections/members) always queries the full member table
// server-side regardless of this cap, so it still finds someone this list
// doesn't reach.
const SUGGESTIONS_LIMIT = 200

// Onboarding suggestions (feedback #83, extended 2026-08-14): inviter, then
// the inviter's own connections, then other Family members with a kid in
// the same grade as one of the viewer's kids, in that priority order — and
// once that's exhausted, every other member on Nettelhorst Bulbord (up to
// SUGGESTIONS_LIMIT total), so the default list is never just "no
// suggestions yet" once a community has more than a handful of members.
// Deduped throughout, excluding the viewer and anyone already connected
// (pending or accepted, either direction — feedback #127: don't suggest
// someone I already have a request in flight with).
export async function getSuggestions(userId: string): Promise<MemberSummary[]> {
  const [[me], myKids, outgoingEdges, incomingEdges] = await Promise.all([
    db.select({ invitedByUserId: users.invitedByUserId }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({ grade: userChildren.grade })
      .from(userChildren)
      .where(and(eq(userChildren.userId, userId), isNull(userChildren.deletedAt))),
    listOutgoingEdges(userId),
    listIncomingEdges(userId),
  ])

  const inviterId = me?.invitedByUserId
  const [inviterGroup, inviterConnectionsGroup] = inviterId
    ? await Promise.all([
        db
          .select(MEMBER_COLUMNS)
          .from(users)
          .where(and(eq(users.id, inviterId), isNull(users.deletedAt), NOT_SERVICE_ACCOUNT))
          .limit(1),
        listAcceptedConnections(inviterId),
      ])
    : [[], []]

  const myGrades = [...new Set(myKids.map((kid) => kid.grade))]
  const gradeMatchGroup = myGrades.length
    ? await db
        .selectDistinct(MEMBER_COLUMNS)
        .from(userChildren)
        .innerJoin(users, eq(users.id, userChildren.userId))
        .where(and(inArray(userChildren.grade, myGrades), isNull(userChildren.deletedAt), isNull(users.deletedAt), NOT_SERVICE_ACCOUNT))
    : []

  // Everyone else, alphabetically (same ordering searchMembers already
  // uses) — a flat fallback tier, not a ranked one, since there's no
  // further signal to sort by. Overlaps with the groups above are expected
  // and harmless; buildSuggestionList dedupes across all of them.
  const everyoneElseGroup = await db
    .select(MEMBER_COLUMNS)
    .from(users)
    .where(and(ne(users.id, userId), isNull(users.deletedAt), NOT_SERVICE_ACCOUNT))
    .orderBy(users.name)
    .limit(SUGGESTIONS_LIMIT)

  const alreadyConnectedIds = [...outgoingEdges, ...incomingEdges].map((e) => e.member.id)
  const suggestions = buildSuggestionList(
    userId,
    [inviterGroup, inviterConnectionsGroup, gradeMatchGroup, everyoneElseGroup],
    alreadyConnectedIds,
  )
  return suggestions.slice(0, SUGGESTIONS_LIMIT)
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
    .where(and(ilike(users.name, `%${trimmed}%`), ne(users.id, userId), isNull(users.deletedAt), NOT_SERVICE_ACCOUNT))
    .orderBy(users.name)
    .limit(20)
}

// Admin dev tool (feedback, 2026-08-14): lets an admin see a live render of
// the "you have a new friend request" alert without needing a second real
// account to trigger one — same shape as newsletter/service.ts's
// sendTestNewsletterEmail, reusing the exact real template/mailer path
// rather than a separately-maintained preview. The admin is both requester
// and recipient here (their own name/photo, sent to their own address) —
// there's no second person to stand in as the requester, and this still
// exercises the real render with real data, same "exact reproduction"
// posture as the sign-up flow preview.
export async function sendTestConnectionAlertEmail(admin: {
  name: string
  email: string
  avatarUrl: string | null
}): Promise<void> {
  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')
  const html = connectionRequestHtml(admin.name, admin.avatarUrl, apiUrl, `${webUrl}/friends`)
  await sendEmail(admin.email, `[Test] ${connectionRequestSubject(admin.name)}`, html)
}

// Dev tool (feedback, 2026-08-16: "I don't wanna just be able to test this
// one time... I'd like to really trigger it anytime"): unlike the email
// preview above (which fakes the template with the admin's own name/photo,
// no real row written), this creates a genuine throwaway member and has it
// send the admin a real friend request — through the same
// requestConnection() path a real request takes, so the alert email, and
// the in-app notification all fire exactly as they would for a real
// request, and the admin can test Accept/Decline against it on the real
// Friends page. isServiceAccount keeps it out of every discovery surface
// (search, suggestions) while it exists; deleting it afterward is the
// existing admin member-deletion tool (DELETE /admin/users/:id), not a
// separate cleanup path.
export async function createTestFriendRequest(adminId: string): Promise<{ id: string; name: string }> {
  const name = `Test Friend Request (delete me) ${Math.random().toString(36).slice(2, 6)}`
  const [tempUser] = await db
    .insert(users)
    .values({
      name,
      invitedByUserId: adminId,
      profileCompletedAt: new Date(),
      friendsStepCompletedAt: new Date(),
      newsletterSubscribed: false,
      isServiceAccount: true,
    })
    .returning({ id: users.id, name: users.name })

  await db.insert(eventsLog).values({ actor: adminId, action: 'test_friend_request_created', metadata: { testUserId: tempUser.id } })
  await requestConnection(tempUser.id, adminId)

  return tempUser
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
