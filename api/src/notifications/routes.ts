import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { dismissNotification, listNotifications } from './service.js'

export async function notificationsRoutes(app: FastifyInstance) {
  app.get('/notifications', { preHandler: requireAuth }, async (request, reply) => {
    const rows = await listNotifications(request.currentUser!.id)
    return reply.send({
      data: rows.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        target_path: n.targetPath,
        actor_name: n.actorName,
        actor_avatar_url: n.actorAvatarUrl,
        created_at: n.createdAt,
        dismissed_at: n.dismissedAt,
      })),
    })
  })

  app.post('/notifications/:id/dismiss', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const ok = await dismissNotification(request.currentUser!.id, id)
    if (!ok) {
      return reply.code(404).send({ error: { message: 'Notification not found' } })
    }
    return reply.send({ data: { dismissed: true } })
  })

  // Feedback #100: "in your settings, there should be notification
  // settings, which indicate what notifications you'll be receiving by
  // channel" — Email is the only toggleable channel (the in-app list above
  // always includes every type; see schema.ts's doc comment on these
  // columns). Newsletter reuses the pre-existing newsletterSubscribed
  // column/PATCH /auth/me path rather than being duplicated here — this
  // route only owns the three columns that are new to this feature.
  app.get('/notifications/settings', { preHandler: requireAuth }, async (request, reply) => {
    const [row] = await db
      .select({
        notifyFriendAddedEmail: users.notifyFriendAddedEmail,
        notifyFeedbackReplyEmail: users.notifyFeedbackReplyEmail,
        notifyContentCommentEmail: users.notifyContentCommentEmail,
        newsletterSubscribed: users.newsletterSubscribed,
      })
      .from(users)
      .where(eq(users.id, request.currentUser!.id))
      .limit(1)
    return reply.send({
      data: {
        newsletter_email: row.newsletterSubscribed,
        friend_added_email: row.notifyFriendAddedEmail,
        feedback_reply_email: row.notifyFeedbackReplyEmail,
        content_comment_email: row.notifyContentCommentEmail,
      },
    })
  })

  app.patch('/notifications/settings', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as {
      newsletter_email?: boolean
      friend_added_email?: boolean
      feedback_reply_email?: boolean
      content_comment_email?: boolean
    }
    const updates: Partial<typeof users.$inferInsert> = {}
    if (typeof body.newsletter_email === 'boolean') updates.newsletterSubscribed = body.newsletter_email
    if (typeof body.friend_added_email === 'boolean') updates.notifyFriendAddedEmail = body.friend_added_email
    if (typeof body.feedback_reply_email === 'boolean') updates.notifyFeedbackReplyEmail = body.feedback_reply_email
    if (typeof body.content_comment_email === 'boolean') updates.notifyContentCommentEmail = body.content_comment_email

    if (Object.keys(updates).length > 0) {
      await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, request.currentUser!.id))
    }
    return reply.send({ data: { updated: true } })
  })
}
