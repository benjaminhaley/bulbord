import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { requireEnv } from '../env.js'
import { sendEmail } from '../newsletter/mailer.js'
import { createNotification } from './service.js'
import { contentCommentHtml, contentCommentSubject } from './template.js'

// Feedback #100: "I will also want a notification if someone replies to an
// event that you created" — extended to Camps too (confirmed with Ben,
// same effort/parity as Events since Camps mirrors Events' comment system
// exactly). Shared by events/comments.ts and camps/comments.ts rather than
// duplicated per feature — this is genuinely generic "someone commented on
// content you created" infra, not part of the Camps-vs-Events divergence
// this codebase otherwise deliberately keeps unshared (see CLAUDE.md's
// Camps section). Same no-self-notify / best-effort-email posture as
// connections/service.ts's notifyConnectionAdded and
// feedback/notifications.ts's notifyFeedbackReply.
export async function notifyContentComment(params: {
  contentKind: 'event' | 'camp'
  contentId: string
  contentTitle: string
  creatorUserId: string | null
  commenterId: string
  commentBody: string
}): Promise<void> {
  const { contentKind, contentId, contentTitle, creatorUserId, commenterId, commentBody } = params
  if (!creatorUserId || creatorUserId === commenterId) return

  const [[creator], [commenter]] = await Promise.all([
    db
      .select({ email: users.email, notifyEmail: users.notifyContentCommentEmail })
      .from(users)
      .where(eq(users.id, creatorUserId))
      .limit(1),
    db.select({ name: users.name, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, commenterId)).limit(1),
  ])

  const commenterName = commenter?.name ?? 'Someone'
  const targetPath = contentKind === 'event' ? `/events/${contentId}` : `/camps/${contentId}`

  await createNotification({
    userId: creatorUserId,
    type: contentKind === 'event' ? 'event_comment' : 'camp_comment',
    actorUserId: commenterId,
    message: `${commenterName} commented on your ${contentKind}: ${contentTitle}`,
    targetPath,
  })

  if (!creator?.email || !creator.notifyEmail) return

  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')
  const html = contentCommentHtml({
    commenterName,
    commenterAvatarUrl: commenter?.avatarUrl ?? null,
    commentBody,
    contentKind,
    contentTitle,
    apiUrl,
    linkUrl: `${webUrl}${targetPath}`,
  })
  await sendEmail(creator.email, contentCommentSubject(commenterName, contentTitle), html)
}
