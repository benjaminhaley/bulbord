import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { db } from '../db/client.js'
import { campComments, camps, eventsLog, users } from '../db/schema.js'
import { notifyContentComment } from '../notifications/content-comment.js'
import { canDeleteComment, canEditComment } from './comment-permissions.js'

async function findComment(campId: string, commentId: string) {
  const [existing] = await db
    .select({ userId: campComments.userId })
    .from(campComments)
    .where(and(eq(campComments.id, commentId), eq(campComments.campId, campId), isNull(campComments.deletedAt)))
    .limit(1)
  return existing ?? null
}

function serializeComment(
  c: Pick<typeof campComments.$inferSelect, 'id' | 'campId' | 'userId' | 'body' | 'createdAt' | 'updatedAt'>,
  authorName: string | null,
  authorAvatarUrl: string | null,
  currentUser: { id: string; roles: string[] } | null,
) {
  return {
    id: c.id,
    camp_id: c.campId,
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

export async function campCommentsRoutes(app: FastifyInstance) {
  app.get('/camps/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const currentUser = request.currentUser!

    const rows = await db
      .select({
        id: campComments.id,
        campId: campComments.campId,
        userId: campComments.userId,
        body: campComments.body,
        createdAt: campComments.createdAt,
        updatedAt: campComments.updatedAt,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(campComments)
      .innerJoin(users, eq(users.id, campComments.userId))
      .where(and(eq(campComments.campId, id), isNull(campComments.deletedAt)))
      .orderBy(desc(campComments.createdAt))

    return reply.send({
      data: rows.map((row) => serializeComment(row, row.authorName, row.authorAvatarUrl, currentUser)),
      has_more: false,
      next_cursor: null,
    })
  })

  app.post('/camps/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { body?: string }
    const text = body.body?.trim()
    if (!text) {
      return reply.code(400).send({ error: { message: 'body is required' } })
    }

    const [camp] = await db
      .select({ id: camps.id, title: camps.title, submittedByUserId: camps.submittedByUserId })
      .from(camps)
      .where(and(eq(camps.id, id), isNull(camps.deletedAt)))
      .limit(1)
    if (!camp) {
      return reply.code(404).send({ error: { message: 'Camp not found' } })
    }

    const currentUser = request.currentUser!
    const [created] = await db.insert(campComments).values({ campId: id, userId: currentUser.id, body: text }).returning()

    await db.insert(eventsLog).values({
      actor: currentUser.id,
      action: 'camp_comment_created',
      metadata: { campId: id, commentId: created.id },
    })

    notifyContentComment({
      contentKind: 'camp',
      contentId: id,
      contentTitle: camp.title,
      creatorUserId: camp.submittedByUserId,
      commenterId: currentUser.id,
      commentBody: text,
    }).catch((err) => console.error('camp comment notification failed', err))

    return reply.code(201).send({ data: serializeComment(created, currentUser.name, currentUser.avatarUrl, currentUser) })
  })

  app.patch('/camps/:id/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
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
      db.update(campComments).set({ body: text, updatedAt: new Date() }).where(eq(campComments.id, commentId)).returning(),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'camp_comment_updated',
        metadata: { campId: id, commentId },
      }),
    ])

    return reply.send({ data: serializeComment(updated, currentUser.name, currentUser.avatarUrl, currentUser) })
  })

  app.delete('/camps/:id/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
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
      db.update(campComments).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(campComments.id, commentId)),
      db.insert(eventsLog).values({ actor: currentUser.id, action: 'camp_comment_deleted', metadata: { campId: id, commentId } }),
    ])

    return reply.code(204).send()
  })
}
