// One-off (feedback #98): completionNote is being folded into the new
// feedback_comments reply thread — see CLAUDE.md's Feedback tab section.
// Every feedback row that still had a non-null completionNote got that text
// backfilled in as the first comment in its thread, authored by the admin
// (the only account that could ever set a note, since POST /feedback/:id/note
// was admin-gated) with the comment's created_at set to the feedback row's
// own updated_at (the closest available signal for when the note was
// actually written — there's no dedicated "noted at" column). Run once,
// before the follow-up migration that dropped the completion_note column —
// permanently a no-op as written now that the column is gone (same shape as
// events/backfill-2026-07-31-event-images.ts's own now-inert query). Reads
// completion_note via raw SQL rather than the typed schema specifically so
// this file keeps compiling as a historical record after that column's
// removal, instead of needing to be deleted outright.
import 'dotenv/config'

import { eq, sql } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, feedbackComments, userRoles } from '../db/schema.js'

async function main() {
  const [admin] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(eq(userRoles.role, 'admin'))
    .limit(1)
  if (!admin) {
    throw new Error('No admin user found — cannot attribute backfilled comments')
  }

  const rows = (
    await db.execute<{ id: string; completion_note: string | null; updated_at: Date }>(
      sql`select id, completion_note, updated_at from feedback where completion_note is not null`,
    )
  ).map((row) => ({ id: row.id, completionNote: row.completion_note, updatedAt: row.updated_at }))

  console.log(`Found ${rows.length} feedback row(s) with a completion note to backfill.`)

  for (const row of rows) {
    if (!row.completionNote?.trim()) continue

    const [created] = await db
      .insert(feedbackComments)
      .values({
        feedbackId: row.id,
        userId: admin.userId,
        body: row.completionNote,
        createdAt: row.updatedAt,
        updatedAt: row.updatedAt,
      })
      .returning({ id: feedbackComments.id })

    await db.insert(eventsLog).values({
      actor: admin.userId,
      action: 'feedback_comment_created',
      metadata: { feedbackId: row.id, commentId: created.id, backfilledFromCompletionNote: true },
    })

    console.log(`  backfilled comment ${created.id} on feedback ${row.id}`)
  }

  console.log('Done.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
