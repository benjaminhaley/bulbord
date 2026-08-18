import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { requireEnv } from '../env.js'
import { sendEmail } from '../newsletter/mailer.js'
import { createNotification, type NotificationType } from './service.js'
import { contentCommentHtml, contentCommentSubject } from './template.js'

// Feedback #100: "I will also want a notification if someone replies to an
// event that you created" — extended to Camps too (confirmed with Ben,
// same effort/parity as Events since Camps mirrors Events' comment system
// exactly), and to Sports & Clubs for the same reason once that tab shipped.
// Shared by events/comments.ts, camps/comments.ts, and
// sports-clubs/comments.ts rather than duplicated per feature — this is
// genuinely generic "someone commented on content you created" infra, not
// part of the per-tab divergence this codebase otherwise deliberately keeps
// unshared (see CLAUDE.md's Camps section). Same no-self-notify /
// best-effort-email posture as connections/service.ts's notifyConnectionAdded
// and feedback/notifications.ts's notifyFeedbackReply.
const CONTENT_KIND_PATH: Record<'event' | 'camp' | 'sports_club', string> = {
  event: 'events',
  camp: 'camps',
  sports_club: 'sports-clubs',
}
const CONTENT_KIND_NOTIFICATION_TYPE: Record<'event' | 'camp' | 'sports_club', NotificationType> = {
  event: 'event_comment',
  camp: 'camp_comment',
  sports_club: 'sports_club_comment',
}
// Grammar label, distinct from the path/type keys above ("commented on your
// sports club" reads right; "commented on your sports_club" wouldn't).
const CONTENT_KIND_LABEL: Record<'event' | 'camp' | 'sports_club', string> = {
  event: 'event',
  camp: 'camp',
  sports_club: 'sports club',
}

export async function notifyContentComment(params: {
  contentKind: 'event' | 'camp' | 'sports_club'
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
  const targetPath = `/${CONTENT_KIND_PATH[contentKind]}/${contentId}`

  await createNotification({
    userId: creatorUserId,
    type: CONTENT_KIND_NOTIFICATION_TYPE[contentKind],
    actorUserId: commenterId,
    message: `${commenterName} commented on your ${CONTENT_KIND_LABEL[contentKind]}: ${contentTitle}`,
    targetPath,
  })

  if (!creator?.email || !creator.notifyEmail) return

  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')
  const html = contentCommentHtml({
    commenterName,
    commenterAvatarUrl: commenter?.avatarUrl ?? null,
    commentBody,
    contentKindLabel: CONTENT_KIND_LABEL[contentKind],
    contentTitle,
    apiUrl,
    linkUrl: `${webUrl}${targetPath}`,
  })
  await sendEmail(creator.email, contentCommentSubject(commenterName, contentTitle), html)
}
