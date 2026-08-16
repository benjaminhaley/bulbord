import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { db } from '../db/client.js'
import { feedback, feedbackComments, eventsLog, users } from '../db/schema.js'
import { canDeleteFeedbackComment, canEditFeedbackComment } from './comment-permissions.js'

async function findComment(feedbackId: string, commentId: string) {
  const [existing] = await db
    .select({ userId: feedbackComments.userId })
    .from(feedbackComments)
    .where(and(eq(feedbackComments.id, commentId), eq(feedbackComments.feedbackId, feedbackId), isNull(feedbackComments.deletedAt)))
    .limit(1)
  return existing ?? null
}

function serializeComment(
  c: Pick<typeof feedbackComments.$inferSelect, 'id' | 'feedbackId' | 'userId' | 'body' | 'createdAt' | 'updatedAt'>,
  authorName: string | null,
  authorAvatarUrl: string | null,
  currentUser: { id: string; roles: string[] } | null,
) {
  return {
    id: c.id,
    feedback_id: c.feedbackId,
    body: c.body,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    author_id: c.userId,
    author_name: authorName,
    author_avatar_url: authorAvatarUrl,
    can_edit: currentUser ? canEditFeedbackComment(currentUser, { userId: c.userId }) : false,
    can_delete: currentUser ? canDeleteFeedbackComment(currentUser, { userId: c.userId }) : false,
  }
}

// feedback #98's whole reason for existing: any member can reply to a
// feedback post (replacing the old admin-only completionNote field), and the
// post's own author gets an in-app-only notification (the unseen-reply badge
// — see feedback/notifications.ts) when someone other than themselves
// replies. No stored `notify` flag is needed here the way user_connections
// has one — unlike a mutual-follow edge, there's no "this would be a
// surprise to no one" case to special-case: every comment from someone other
// than the feedback's own author is notify-worthy for that author, and the
// unseen count is computed live off feedbackComments.createdAt vs.
// users.feedbackRepliesSeenAt (see notifications.ts) rather than persisted
// per-comment.
export async function feedbackCommentsRoutes(app: FastifyInstance) {
  app.get('/feedback/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const currentUser = request.currentUser!

    const rows = await db
      .select({
        id: feedbackComments.id,
        feedbackId: feedbackComments.feedbackId,
        userId: feedbackComments.userId,
        body: feedbackComments.body,
        createdAt: feedbackComments.createdAt,
        updatedAt: feedbackComments.updatedAt,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(feedbackComments)
      .innerJoin(users, eq(users.id, feedbackComments.userId))
      .where(and(eq(feedbackComments.feedbackId, id), isNull(feedbackComments.deletedAt)))
      .orderBy(desc(feedbackComments.createdAt))

    return reply.send({
      data: rows.map((row) => serializeComment(row, row.authorName, row.authorAvatarUrl, currentUser)),
      has_more: false,
      next_cursor: null,
    })
  })

  app.post('/feedback/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { body?: string }
    const text = body.body?.trim()
    if (!text) {
      return reply.code(400).send({ error: { message: 'body is required' } })
    }

    const [item] = await db
      .select({ id: feedback.id })
      .from(feedback)
      .where(and(eq(feedback.id, id), isNull(feedback.deletedAt)))
      .limit(1)
    if (!item) {
      return reply.code(404).send({ error: { message: 'Feedback not found' } })
    }

    const currentUser = request.currentUser!
    const [created] = await db
      .insert(feedbackComments)
      .values({ feedbackId: id, userId: currentUser.id, body: text })
      .returning()

    await db.insert(eventsLog).values({
      actor: currentUser.id,
      action: 'feedback_comment_created',
      metadata: { feedbackId: id, commentId: created.id },
    })

    return reply.code(201).send({ data: serializeComment(created, currentUser.name, currentUser.avatarUrl, currentUser) })
  })

  app.patch('/feedback/:id/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, commentId } = request.params as { id: string; commentId: string }
    const body = request.body as { body?: string }
    const text = body.body?.trim()
    if (!text) {
      return reply.code(400).send({ error: { message: 'body is required' } })
    }

    const currentUser = request.currentUser!
    const existing = await findComment(id, commentId)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Comment not found' } })
    }
    if (!canEditFeedbackComment(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    const [[updated]] = await Promise.all([
      db.update(feedbackComments).set({ body: text, updatedAt: new Date() }).where(eq(feedbackComments.id, commentId)).returning(),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'feedback_comment_updated',
        metadata: { feedbackId: id, commentId },
      }),
    ])

    return reply.send({ data: serializeComment(updated, currentUser.name, currentUser.avatarUrl, currentUser) })
  })

  app.delete('/feedback/:id/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, commentId } = request.params as { id: string; commentId: string }
    const currentUser = request.currentUser!

    const existing = await findComment(id, commentId)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Comment not found' } })
    }
    if (!canDeleteFeedbackComment(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    await Promise.all([
      db.update(feedbackComments).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(feedbackComments.id, commentId)),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'feedback_comment_deleted',
        metadata: { feedbackId: id, commentId },
      }),
    ])

    return reply.code(204).send()
  })
}
