import 'dotenv/config'
import { and, eq, isNull, ne } from 'drizzle-orm'

import { db } from '../db/client.js'
import {
  campComments,
  campInterests,
  camps,
  eventComments,
  eventInterests,
  events,
  eventsLog,
  feedback,
  passkeyCredentials,
  sessions,
  userRoles,
  users,
} from '../db/schema.js'

// One-off, run once against production: Anna Piepmeyer ended up with two
// active accounts (feedback #49 follow-up, 2026-08-05) — a second passkey
// registration created a brand new account rather than adding a credential
// to her existing one. Per Ben: keep the newer account, reassign whatever
// real data/access the older one has onto it, then soft-delete the older
// one. He explicitly said not to worry about perfectly preserving the old
// account, so conflicts (e.g. she swiped the same event/camp from both
// accounts) resolve in favor of the surviving account's own row rather than
// anything fancier.
const OLD_ANNA_USER_ID = '684385bb-fdad-4cf6-b8c4-0d3eec33dd92'
const NEW_ANNA_USER_ID = 'b09a41cb-d7de-4baa-8b6e-a700821de6ae'

async function main() {
  // Passkeys and sessions: reassigning these means whichever device
  // registered the old account's passkey can still sign in — as the
  // surviving account — going forward. No uniqueness conflict possible
  // (credential_id/token_hash are already globally unique).
  await db.update(passkeyCredentials).set({ userId: NEW_ANNA_USER_ID }).where(eq(passkeyCredentials.userId, OLD_ANNA_USER_ID))
  await db.update(sessions).set({ userId: NEW_ANNA_USER_ID }).where(eq(sessions.userId, OLD_ANNA_USER_ID))
  await db.update(userRoles).set({ userId: NEW_ANNA_USER_ID }).where(eq(userRoles.userId, OLD_ANNA_USER_ID))

  // event_interests / camp_interests: unique on (userId, entityId). If the
  // new account already swiped the same event/camp, drop the old account's
  // row (it's redundant) rather than reassigning into a conflict; otherwise
  // move it over.
  const oldEventInterests = await db.select().from(eventInterests).where(eq(eventInterests.userId, OLD_ANNA_USER_ID))
  for (const row of oldEventInterests) {
    const [existing] = await db
      .select({ id: eventInterests.id })
      .from(eventInterests)
      .where(and(eq(eventInterests.userId, NEW_ANNA_USER_ID), eq(eventInterests.eventId, row.eventId)))
    if (existing) {
      await db.delete(eventInterests).where(eq(eventInterests.id, row.id))
    } else {
      await db.update(eventInterests).set({ userId: NEW_ANNA_USER_ID }).where(eq(eventInterests.id, row.id))
    }
  }

  const oldCampInterests = await db.select().from(campInterests).where(eq(campInterests.userId, OLD_ANNA_USER_ID))
  for (const row of oldCampInterests) {
    const [existing] = await db
      .select({ id: campInterests.id })
      .from(campInterests)
      .where(and(eq(campInterests.userId, NEW_ANNA_USER_ID), eq(campInterests.campId, row.campId)))
    if (existing) {
      await db.delete(campInterests).where(eq(campInterests.id, row.id))
    } else {
      await db.update(campInterests).set({ userId: NEW_ANNA_USER_ID }).where(eq(campInterests.id, row.id))
    }
  }

  // Comments, feedback, and submitted listings: no uniqueness constraint on
  // authorship, so these reassign directly.
  await db.update(eventComments).set({ userId: NEW_ANNA_USER_ID }).where(eq(eventComments.userId, OLD_ANNA_USER_ID))
  await db.update(campComments).set({ userId: NEW_ANNA_USER_ID }).where(eq(campComments.userId, OLD_ANNA_USER_ID))
  await db
    .update(feedback)
    .set({ createdByUserId: NEW_ANNA_USER_ID })
    .where(eq(feedback.createdByUserId, OLD_ANNA_USER_ID))
  await db
    .update(feedback)
    .set({ completedByUserId: NEW_ANNA_USER_ID })
    .where(eq(feedback.completedByUserId, OLD_ANNA_USER_ID))
  await db.update(events).set({ submittedByUserId: NEW_ANNA_USER_ID }).where(eq(events.submittedByUserId, OLD_ANNA_USER_ID))
  await db.update(events).set({ approvedByUserId: NEW_ANNA_USER_ID }).where(eq(events.approvedByUserId, OLD_ANNA_USER_ID))
  await db.update(camps).set({ submittedByUserId: NEW_ANNA_USER_ID }).where(eq(camps.submittedByUserId, OLD_ANNA_USER_ID))
  await db.update(camps).set({ approvedByUserId: NEW_ANNA_USER_ID }).where(eq(camps.approvedByUserId, OLD_ANNA_USER_ID))

  // Anyone the old account invited (unlikely, but preserves the social graph
  // if it happened) now shows as invited by the surviving account.
  await db
    .update(users)
    .set({ invitedByUserId: NEW_ANNA_USER_ID })
    .where(and(eq(users.invitedByUserId, OLD_ANNA_USER_ID), ne(users.id, NEW_ANNA_USER_ID)))

  // Soft-delete the old account — never a hard delete, per CLAUDE.md's
  // recoverability rule.
  await db
    .update(users)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, OLD_ANNA_USER_ID), isNull(users.deletedAt)))

  await db.insert(eventsLog).values({
    actor: 'claude:merge-anna-backfill-2026-08-05',
    action: 'user_merged',
    metadata: { oldUserId: OLD_ANNA_USER_ID, newUserId: NEW_ANNA_USER_ID, reason: 'duplicate Anna Piepmeyer accounts (feedback #49 follow-up)' },
  })

  console.log(`Merged ${OLD_ANNA_USER_ID} into ${NEW_ANNA_USER_ID} and soft-deleted the old account.`)
}

await main()
process.exit(0)
