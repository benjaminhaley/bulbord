import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { db } from '../db/client.js'
import { eventComments, events, eventsLog, users } from '../db/schema.js'
import { notifyContentComment } from '../notifications/content-comment.js'
import { canDeleteComment, canEditComment } from './comment-permissions.js'

async function findComment(eventId: string, commentId: string) {
  const [existing] = await db
    .select({ userId: eventComments.userId })
    .from(eventComments)
    .where(and(eq(eventComments.id, commentId), eq(eventComments.eventId, eventId), isNull(eventComments.deletedAt)))
    .limit(1)
  return existing ?? null
}

function serializeComment(
  c: Pick<typeof eventComments.$inferSelect, 'id' | 'eventId' | 'userId' | 'body' | 'createdAt' | 'updatedAt'>,
  authorName: string | null,
  authorAvatarUrl: string | null,
  currentUser: { id: string; roles: string[] } | null,
) {
  return {
    id: c.id,
    event_id: c.eventId,
    body: c.body,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    author_id: c.userId,
    author_name: authorName,
    author_avatar_url: authorAvatarUrl,
    can_edit: currentUser ? canEditComment(currentUser, { userId: c.userId }) : false,
    can_delete: currentUser ? canDeleteComment(currentUser, { userId: c.userId }) : false,
  }
}

export async function eventCommentsRoutes(app: FastifyInstance) {
  app.get('/events/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const currentUser = request.currentUser!

    const rows = await db
      .select({
        id: eventComments.id,
        eventId: eventComments.eventId,
        userId: eventComments.userId,
        body: eventComments.body,
        createdAt: eventComments.createdAt,
        updatedAt: eventComments.updatedAt,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(eventComments)
      .innerJoin(users, eq(users.id, eventComments.userId))
      .where(and(eq(eventComments.eventId, id), isNull(eventComments.deletedAt)))
      .orderBy(desc(eventComments.createdAt))

    return reply.send({
      data: rows.map((row) => serializeComment(row, row.authorName, row.authorAvatarUrl, currentUser)),
      has_more: false,
      next_cursor: null,
    })
  })

  app.post('/events/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { body?: string }
    const text = body.body?.trim()
    if (!text) {
      return reply.code(400).send({ error: { message: 'body is required' } })
    }

    const [event] = await db
      .select({ id: events.id, title: events.title, submittedByUserId: events.submittedByUserId })
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1)
    if (!event) {
      return reply.code(404).send({ error: { message: 'Event not found' } })
    }

    const currentUser = request.currentUser!
    const [created] = await db
      .insert(eventComments)
      .values({ eventId: id, userId: currentUser.id, body: text })
      .returning()

    await db.insert(eventsLog).values({
      actor: currentUser.id,
      action: 'event_comment_created',
      metadata: { eventId: id, commentId: created.id },
    })

    notifyContentComment({
      contentKind: 'event',
      contentId: id,
      contentTitle: event.title,
      creatorUserId: event.submittedByUserId,
      commenterId: currentUser.id,
      commentBody: text,
    }).catch((err) => console.error('event comment notification failed', err))

    return reply.code(201).send({ data: serializeComment(created, currentUser.name, currentUser.avatarUrl, currentUser) })
  })

  app.patch('/events/:id/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
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
    if (!canEditComment(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    const [[updated]] = await Promise.all([
      db.update(eventComments).set({ body: text, updatedAt: new Date() }).where(eq(eventComments.id, commentId)).returning(),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'event_comment_updated',
        metadata: { eventId: id, commentId },
      }),
    ])

    return reply.send({ data: serializeComment(updated, currentUser.name, currentUser.avatarUrl, currentUser) })
  })

  app.delete('/events/:id/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, commentId } = request.params as { id: string; commentId: string }
    const currentUser = request.currentUser!

    const existing = await findComment(id, commentId)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Comment not found' } })
    }
    if (!canDeleteComment(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    await Promise.all([
      db.update(eventComments).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(eventComments.id, commentId)),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'event_comment_deleted',
        metadata: { eventId: id, commentId },
      }),
    ])

    return reply.code(204).send()
  })
}
