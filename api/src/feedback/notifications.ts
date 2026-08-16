import { and, eq, gt, isNull, ne } from 'drizzle-orm'

import { db } from '../db/client.js'
import { feedback, feedbackComments, users } from '../db/schema.js'

// feedback #98's red-dot count: comments on a feedback post the viewer
// authored, made by someone other than the viewer, created since the viewer
// last opened the Feedback tab — mirrors connections/service.ts's
// getUnseenFriendCount exactly, including taking feedbackRepliesSeenAt/
// createdAt as params rather than re-querying `users` (the auth plugin's
// onRequest hook already fetched the full row for every authenticated
// request — see plugin.ts's AuthedUser). `feedbackRepliesSeenAt` null (a
// brand-new account, or one that predates this feature) falls back to the
// user's own `createdAt` — nothing could have been "new" before the account
// existed.
export async function getUnseenFeedbackReplyCount(userId: string, feedbackRepliesSeenAt: Date | null, createdAt: Date): Promise<number> {
  const since = feedbackRepliesSeenAt ?? createdAt

  const rows = await db
    .select({ id: feedbackComments.id })
    .from(feedbackComments)
    .innerJoin(feedback, eq(feedback.id, feedbackComments.feedbackId))
    .where(
      and(
        eq(feedback.createdByUserId, userId),
        isNull(feedback.deletedAt),
        isNull(feedbackComments.deletedAt),
        ne(feedbackComments.userId, userId),
        gt(feedbackComments.createdAt, since),
      ),
    )
  return rows.length
}

// Clears the badge (feedback #98) — called whenever the Feedback tab is
// opened (confirmed with Ben: any visit to the tab marks all unseen replies
// seen, not just the specific item that was read).
export async function markFeedbackRepliesSeen(userId: string): Promise<void> {
  await db.update(users).set({ feedbackRepliesSeenAt: new Date() }).where(eq(users.id, userId))
}
