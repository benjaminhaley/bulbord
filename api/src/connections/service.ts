import { and, eq, gt, ilike, inArray, isNull, ne } from 'drizzle-orm'

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
// Excludes operational accounts (today, just Apple App Review) from every
// discovery surface below — feedback, 2026-08-14, after it showed up as a
// friend suggestion. See schema.ts's isServiceAccount comment.
const NOT_SERVICE_ACCOUNT = eq(users.isServiceAccount, false)

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

// Feedback #94's red-dot/banner count: active, notify-worthy incoming edges
// created since the viewer last saw their Friends page. `friendsSeenAt` null
// (a brand-new account, or one that predates this feature and hasn't been
// backfilled) falls back to the user's own `createdAt` — nothing could have
// been "new" to them before their account existed. Takes the viewer's own
// friendsSeenAt/createdAt as params rather than re-querying `users` for
// them — the auth plugin's onRequest hook already fetched the full row for
// every authenticated request (see plugin.ts's AuthedUser), so GET /auth/me
// calling this doesn't need a second lookup for data it already has.
export async function getUnseenFriendCount(userId: string, friendsSeenAt: Date | null, createdAt: Date): Promise<number> {
  const since = friendsSeenAt ?? createdAt

  const rows = await db
    .select({ id: userConnections.id })
    .from(userConnections)
    .innerJoin(users, eq(users.id, userConnections.userId))
    .where(
      and(
        eq(userConnections.connectedUserId, userId),
        isNull(userConnections.deletedAt),
        isNull(users.deletedAt),
        eq(userConnections.notify, true),
        gt(userConnections.createdAt, since),
      ),
    )
  return rows.length
}

// Clears the badge/banner (feedback #94) — called when the Friends page is
// opened, and when the banner itself is dismissed without visiting it.
export async function markFriendsSeen(userId: string): Promise<void> {
  await db.update(users).set({ friendsSeenAt: new Date() }).where(eq(users.id, userId))
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

  const created = !existing || existing.deletedAt !== null

  if (created) {
    // Only a surprise to the recipient — and so only "notify"-worthy, both
    // for the alert email and the in-app unseen-count badge (feedback #94)
    // — when the reverse edge (them -> the adder) doesn't already exist
    // (feedback, 2026-08-14: Ben added Anna, she was correctly alerted;
    // Anna then added him back to complete the pair, and he was wrongly
    // alerted too — he'd already initiated it himself, so there was
    // nothing to tell him). Computed before the insert so the new row's own
    // `notify` column can record it once, rather than re-deriving it later.
    const [reverseEdge] = await db
      .select({ id: userConnections.id })
      .from(userConnections)
      .where(and(eq(userConnections.userId, connectedUserId), eq(userConnections.connectedUserId, userId), isNull(userConnections.deletedAt)))
      .limit(1)
    const notify = !reverseEdge

    if (!existing) {
      await db.insert(userConnections).values({ userId, connectedUserId, notify })
    } else {
      await db.update(userConnections).set({ deletedAt: null, notify, updatedAt: new Date() }).where(eq(userConnections.id, existing.id))
    }

    await db.insert(eventsLog).values({ actor: userId, action: 'connection_added', metadata: { connectedUserId } })

    if (notify) {
      // Best-effort — a failed send shouldn't undo the add.
      await notifyConnectionAdded(userId, connectedUserId).catch((err) => {
        console.error('connection alert email failed', err)
      })
    }
  }
  return { created }
}

async function notifyConnectionAdded(adderId: string, recipientId: string) {
  const [[adder], [recipient]] = await Promise.all([
    db.select({ name: users.name, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, adderId)).limit(1),
    db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, recipientId)).limit(1),
  ])
  if (!recipient?.email) return

  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')
  const adderName = adder?.name ?? 'Someone'
  await sendEmail(
    recipient.email,
    connectionAlertSubject(adderName),
    connectionAlertHtml(adderName, adder?.avatarUrl ?? null, apiUrl, `${webUrl}/friends`),
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
// Deduped throughout, excluding the viewer and anyone already connected.
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
          .where(and(eq(users.id, inviterId), isNull(users.deletedAt), NOT_SERVICE_ACCOUNT))
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

  const suggestions = buildSuggestionList(
    userId,
    [inviterGroup, inviterConnectionsGroup, gradeMatchGroup, everyoneElseGroup],
    existingConnections.map((c) => c.id),
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
// the "X added you as a friend" alert without needing a second real account
// to trigger one — same shape as newsletter/service.ts's
// sendTestNewsletterEmail, reusing the exact real template/mailer path
// rather than a separately-maintained preview. The admin is both "adder"
// and recipient here (their own name/photo, sent to their own address) —
// there's no second person to stand in as the adder, and this still
// exercises the real render with real data, same "exact reproduction"
// posture as the sign-up flow preview.
export async function sendTestConnectionAlertEmail(admin: {
  name: string
  email: string
  avatarUrl: string | null
}): Promise<void> {
  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')
  const html = connectionAlertHtml(admin.name, admin.avatarUrl, apiUrl, `${webUrl}/friends`)
  await sendEmail(admin.email, `[Test] ${connectionAlertSubject(admin.name)}`, html)
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
