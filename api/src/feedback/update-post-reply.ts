// Reusable: posts a short reply on a feedback item, authored by the dedicated
// "Claude" service account (feedback #172 — progress notes are replies, never
// edits to the original post, and must be visibly from Claude, not Ben).
// Usage (against production, DATABASE_URL = the Postgres DATABASE_PUBLIC_URL):
//   npm run feedback:reply -- <feedbackNumber> "<reply text, ~180 chars max>"
// Never touches the feedback row itself.
import 'dotenv/config'

import { and, eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, feedback, feedbackComments, users } from '../db/schema.js'

const MAX_LENGTH = 200

async function main() {
  const [numberArg, body] = process.argv.slice(2)
  const number = Number(numberArg)
  if (!Number.isInteger(number) || !body?.trim()) {
    throw new Error('Usage: feedback:reply <feedbackNumber> "<reply text>"')
  }
  if (body.length > MAX_LENGTH) {
    throw new Error(`Reply is ${body.length} chars; keep it short (aim under 180, hard cap ${MAX_LENGTH}).`)
  }

  const [item] = await db.select({ id: feedback.id }).from(feedback).where(eq(feedback.number, number))
  if (!item) throw new Error(`No feedback #${number}`)
  const [claude] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.name, 'Claude'), eq(users.isServiceAccount, true)))
    .limit(1)
  if (!claude) throw new Error('No "Claude" service account found')

  const [created] = await db
    .insert(feedbackComments)
    .values({ feedbackId: item.id, userId: claude.id, body })
    .returning({ id: feedbackComments.id })
  await db.insert(eventsLog).values({
    actor: claude.id,
    action: 'feedback_comment_created',
    metadata: { feedbackId: item.id, commentId: created.id },
  })
  console.log(`Posted reply ${created.id} on feedback #${number}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
