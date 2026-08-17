import { and, eq, gt, isNull, ne } from 'drizzle-orm'

import { db } from '../db/client.js'
import { feedback, feedbackComments, users } from '../db/schema.js'
import { requireEnv } from '../env.js'
import { sendEmail } from '../newsletter/mailer.js'
import { feedbackReplyHtml, feedbackReplySubject } from './template.js'

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

// Reverses the original "in-app only, no email" decision (feedback #98,
// same day): "the reply, including any images that were posted... so
// ideally they can read it even before clicking back into the app." Only
// fires when someone other than the feedback's own author replies — same
// no-self-notify rule as the in-app badge above, and the same reasoning
// user_connections' `notify` flag applies to its own alert email (nothing
// to tell someone about their own action). Best-effort: called from
// comments.ts without being awaited into the response, and a failed send is
// logged, not thrown — same graceful-degrade posture as
// connections/service.ts's notifyConnectionAdded. `replyImageUrls` is
// passed straight through from the just-inserted comment (feedback,
// 2026-08-17: replies got their own photo-attachment support) rather than
// re-queried here — the caller already has them in hand.
export async function notifyFeedbackReply(
  feedbackId: string,
  replierId: string,
  replyBody: string,
  replyImageUrls: string[],
): Promise<void> {
  const [item] = await db
    .select({ title: feedback.title, number: feedback.number, createdByUserId: feedback.createdByUserId })
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1)
  if (!item?.createdByUserId || item.createdByUserId === replierId) return

  const [[author], [replier]] = await Promise.all([
    db.select({ email: users.email }).from(users).where(eq(users.id, item.createdByUserId)).limit(1),
    db.select({ name: users.name, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, replierId)).limit(1),
  ])
  if (!author?.email) return

  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')
  const replierName = replier?.name ?? 'Someone'
  const html = feedbackReplyHtml({
    replierName,
    replierAvatarUrl: replier?.avatarUrl ?? null,
    replyBody,
    feedbackTitle: item.title,
    feedbackNumber: item.number,
    replyImageUrls,
    apiUrl,
    linkUrl: `${webUrl}/feedback/${feedbackId}`,
  })
  await sendEmail(author.email, feedbackReplySubject(replierName, item.title), html)
}
