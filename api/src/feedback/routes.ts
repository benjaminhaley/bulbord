import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { db } from '../db/client.js'
import { eventsLog, feedback, users } from '../db/schema.js'
import { requireAuth, requireRole } from '../auth/plugin.js'

function serializeFeedback(
  f: Pick<
    typeof feedback.$inferSelect,
    | 'id'
    | 'number'
    | 'title'
    | 'description'
    | 'createdAt'
    | 'completedAt'
    | 'completionNote'
    | 'imageUrl'
    | 'thumbnailUrl'
  >,
  authorName: string | null,
) {
  return {
    id: f.id,
    number: f.number,
    title: f.title,
    description: f.description,
    created_at: f.createdAt,
    author_name: authorName,
    image_url: f.imageUrl,
    thumbnail_url: f.thumbnailUrl,
    completed_at: f.completedAt,
    completion_note: f.completionNote,
  }
}

export async function feedbackRoutes(app: FastifyInstance) {
  app.get('/feedback', { preHandler: requireAuth }, async (_request, reply) => {
    const rows = await db
      .select({
        id: feedback.id,
        number: feedback.number,
        title: feedback.title,
        description: feedback.description,
        createdAt: feedback.createdAt,
        completedAt: feedback.completedAt,
        completionNote: feedback.completionNote,
        imageUrl: feedback.imageUrl,
        thumbnailUrl: feedback.thumbnailUrl,
        authorName: users.name,
      })
      .from(feedback)
      .leftJoin(users, eq(users.id, feedback.createdByUserId))
      .where(isNull(feedback.deletedAt))
      .orderBy(desc(feedback.createdAt))

    return reply.send({
      data: rows.map((row) => serializeFeedback(row, row.authorName)),
      has_more: false,
      next_cursor: null,
    })
  })

  app.post('/feedback', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { title?: string; description?: string; image_url?: string; thumbnail_url?: string }
    const title = body.title?.trim()
    if (!title) {
      return reply.code(400).send({ error: { message: 'title is required' } })
    }

    const userId = request.currentUser!.id
    const [created] = await db
      .insert(feedback)
      .values({
        title,
        description: body.description?.trim() || null,
        imageUrl: body.image_url || null,
        thumbnailUrl: body.thumbnail_url || null,
        createdByUserId: userId,
      })
      .returning()

    await db.insert(eventsLog).values({
      actor: userId,
      action: 'feedback_created',
      metadata: { feedbackId: created.id },
    })

    return reply.code(201).send({ data: serializeFeedback(created, request.currentUser!.name) })
  })

  app.post('/feedback/:id/complete', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { note?: string }

    const [updated] = await db
      .update(feedback)
      .set({
        completedAt: new Date(),
        completionNote: body.note?.trim() || null,
        completedByUserId: request.currentUser!.id,
        updatedAt: new Date(),
      })
      .where(and(eq(feedback.id, id), isNull(feedback.deletedAt)))
      .returning()

    if (!updated) {
      return reply.code(404).send({ error: { message: 'Feedback not found' } })
    }

    await db.insert(eventsLog).values({
      actor: request.currentUser!.id,
      action: 'feedback_completed',
      metadata: { feedbackId: id },
    })

    const [authorRow] = updated.createdByUserId
      ? await db.select({ name: users.name }).from(users).where(eq(users.id, updated.createdByUserId)).limit(1)
      : []

    return reply.send({ data: serializeFeedback(updated, authorRow?.name ?? null) })
  })
}
