import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { db } from '../db/client.js'
import { eventsLog, sportsClubComments, sportsClubs, users } from '../db/schema.js'
import { notifyContentComment } from '../notifications/content-comment.js'
import { canDeleteComment, canEditComment } from './comment-permissions.js'

async function findComment(sportsClubId: string, commentId: string) {
  const [existing] = await db
    .select({ userId: sportsClubComments.userId })
    .from(sportsClubComments)
    .where(
      and(
        eq(sportsClubComments.id, commentId),
        eq(sportsClubComments.sportsClubId, sportsClubId),
        isNull(sportsClubComments.deletedAt),
      ),
    )
    .limit(1)
  return existing ?? null
}

function serializeComment(
  c: Pick<typeof sportsClubComments.$inferSelect, 'id' | 'sportsClubId' | 'userId' | 'body' | 'createdAt' | 'updatedAt'>,
  authorName: string | null,
  authorAvatarUrl: string | null,
  currentUser: { id: string; roles: string[] } | null,
) {
  return {
    id: c.id,
    sports_club_id: c.sportsClubId,
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

export async function sportsClubCommentsRoutes(app: FastifyInstance) {
  app.get('/sports-clubs/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const currentUser = request.currentUser!

    const rows = await db
      .select({
        id: sportsClubComments.id,
        sportsClubId: sportsClubComments.sportsClubId,
        userId: sportsClubComments.userId,
        body: sportsClubComments.body,
        createdAt: sportsClubComments.createdAt,
        updatedAt: sportsClubComments.updatedAt,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(sportsClubComments)
      .innerJoin(users, eq(users.id, sportsClubComments.userId))
      .where(and(eq(sportsClubComments.sportsClubId, id), isNull(sportsClubComments.deletedAt)))
      .orderBy(desc(sportsClubComments.createdAt))

    return reply.send({
      data: rows.map((row) => serializeComment(row, row.authorName, row.authorAvatarUrl, currentUser)),
      has_more: false,
      next_cursor: null,
    })
  })

  app.post('/sports-clubs/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { body?: string }
    const text = body.body?.trim()
    if (!text) {
      return reply.code(400).send({ error: { message: 'body is required' } })
    }

    const [sportsClub] = await db
      .select({ id: sportsClubs.id, title: sportsClubs.title, submittedByUserId: sportsClubs.submittedByUserId })
      .from(sportsClubs)
      .where(and(eq(sportsClubs.id, id), isNull(sportsClubs.deletedAt)))
      .limit(1)
    if (!sportsClub) {
      return reply.code(404).send({ error: { message: 'Sports club not found' } })
    }

    const currentUser = request.currentUser!
    const [created] = await db
      .insert(sportsClubComments)
      .values({ sportsClubId: id, userId: currentUser.id, body: text })
      .returning()

    await db.insert(eventsLog).values({
      actor: currentUser.id,
      action: 'sports_club_comment_created',
      metadata: { sportsClubId: id, commentId: created.id },
    })

    notifyContentComment({
      contentKind: 'sports_club',
      contentId: id,
      contentTitle: sportsClub.title,
      creatorUserId: sportsClub.submittedByUserId,
      commenterId: currentUser.id,
      commentBody: text,
    }).catch((err) => console.error('sports club comment notification failed', err))

    return reply.code(201).send({ data: serializeComment(created, currentUser.name, currentUser.avatarUrl, currentUser) })
  })

  app.patch('/sports-clubs/:id/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
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
      db
        .update(sportsClubComments)
        .set({ body: text, updatedAt: new Date() })
        .where(eq(sportsClubComments.id, commentId))
        .returning(),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'sports_club_comment_updated',
        metadata: { sportsClubId: id, commentId },
      }),
    ])

    return reply.send({ data: serializeComment(updated, currentUser.name, currentUser.avatarUrl, currentUser) })
  })

  app.delete('/sports-clubs/:id/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
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
      db
        .update(sportsClubComments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(sportsClubComments.id, commentId)),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'sports_club_comment_deleted',
        metadata: { sportsClubId: id, commentId },
      }),
    ])

    return reply.code(204).send()
  })
}
