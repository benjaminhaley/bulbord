import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, feedbackComments, users } from '../db/schema.js'

// One-off (feedback #172): a dedicated "Claude" service account so Claude's
// feedback replies are visibly authored by Claude, not by Ben's account.
// Same shape as the App Review account: a normal already-onboarded member
// (invited by Ben), flagged isServiceAccount so it never shows up in friend
// suggestions/search. No email, no notification emails, no session.
// Also re-attributes the one reply already posted on #172 under Ben's id.
const BEN_USER_ID = '3387293c-2d87-454b-be0c-1d415baba252'
const FIRST_REPLY_ID = 'b8c9e793-ec1d-4af1-8b22-bfcec685b895'

async function main() {
  const [claude] = await db
    .insert(users)
    .values({
      name: 'Claude',
      invitedByUserId: BEN_USER_ID,
      profileCompletedAt: new Date(),
      friendsStepCompletedAt: new Date(),
      role: 'other',
      roleOther: 'AI assistant that builds and maintains Bulbord',
      isServiceAccount: true,
      newsletterSubscribed: false,
      notifyFriendAddedEmail: false,
      notifyFeedbackReplyEmail: false,
      notifyContentCommentEmail: false,
    })
    .returning({ id: users.id })

  await db.update(feedbackComments).set({ userId: claude.id }).where(eq(feedbackComments.id, FIRST_REPLY_ID))

  await db.insert(eventsLog).values({
    actor: 'claude:claude-account-2026-09-19',
    action: 'user_created',
    metadata: { userId: claude.id, reason: 'Claude service account for feedback replies (#172)', reattributedCommentId: FIRST_REPLY_ID },
  })
  console.log(`Claude user id: ${claude.id}`)
}

await main()
process.exit(0)
