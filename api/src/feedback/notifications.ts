import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { feedback, users } from '../db/schema.js'
import { requireEnv } from '../env.js'
import { sendEmail } from '../newsletter/mailer.js'
import { createNotification } from '../notifications/service.js'
import { feedbackReplyHtml, feedbackReplySubject } from './template.js'

// feedback #98's original in-app-only notification, now backed by the
// unified notifications table (feedback #100) rather than a
// feedbackRepliesSeenAt watermark — see notifications/service.ts. Reverses
// the original "in-app only, no email" decision (feedback #98, same day):
// "the reply, including any images that were posted... so ideally they can
// read it even before clicking back into the app." Only fires when someone
// other than the feedback's own author replies — same no-self-notify rule
// as user_connections' own `notify` flag. Best-effort: called from
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
    db
      .select({ email: users.email, notifyEmail: users.notifyFeedbackReplyEmail })
      .from(users)
      .where(eq(users.id, item.createdByUserId))
      .limit(1),
    db.select({ name: users.name, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, replierId)).limit(1),
  ])

  const replierName = replier?.name ?? 'Someone'
  await createNotification({
    userId: item.createdByUserId,
    type: 'feedback_reply',
    actorUserId: replierId,
    message: `${replierName} replied to your feedback: ${item.title}`,
    targetPath: `/feedback/${feedbackId}`,
  })

  if (!author?.email || !author.notifyEmail) return

  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')
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
