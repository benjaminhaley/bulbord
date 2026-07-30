import { desc, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { db } from '../db/client.js'
import { eventsLog, feedback } from '../db/schema.js'
import { requireAuth } from '../auth/plugin.js'

function serializeFeedback(f: Pick<typeof feedback.$inferSelect, 'id' | 'title' | 'description' | 'createdAt'>) {
  return {
    id: f.id,
    title: f.title,
    description: f.description,
    created_at: f.createdAt,
  }
}

export async function feedbackRoutes(app: FastifyInstance) {
  app.get('/feedback', async (_request, reply) => {
    const rows = await db
      .select({
        id: feedback.id,
        title: feedback.title,
        description: feedback.description,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .where(isNull(feedback.deletedAt))
      .orderBy(desc(feedback.createdAt))

    return reply.send({ data: rows.map(serializeFeedback), has_more: false, next_cursor: null })
  })

  app.post('/feedback', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { title?: string; description?: string }
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
        createdByUserId: userId,
      })
      .returning()

    await db.insert(eventsLog).values({
      actor: userId,
      action: 'feedback_created',
      metadata: { feedbackId: created.id },
    })

    return reply.code(201).send({ data: serializeFeedback(created) })
  })
}
