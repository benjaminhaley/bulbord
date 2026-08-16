import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { db } from '../db/client.js'
import { eventsLog, feedback, feedbackImages, users } from '../db/schema.js'
import { requireAuth, requireRole } from '../auth/plugin.js'
import { canEditFeedback } from './permissions.js'

type FeedbackImage = { imageUrl: string; thumbnailUrl: string }

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
    | 'backloggedAt'
    | 'inProgressAt'
    | 'createdByUserId'
  >,
  authorName: string | null,
  images: FeedbackImage[],
  currentUser: { id: string },
) {
  return {
    id: f.id,
    number: f.number,
    title: f.title,
    description: f.description,
    created_at: f.createdAt,
    author_name: authorName,
    images: images.map((img) => ({ image_url: img.imageUrl, thumbnail_url: img.thumbnailUrl })),
    completed_at: f.completedAt,
    completion_note: f.completionNote,
    backlogged_at: f.backloggedAt,
    in_progress_at: f.inProgressAt,
    can_edit: canEditFeedback(currentUser, f),
  }
}

async function fetchImagesByFeedbackId(feedbackIds: string[]): Promise<Map<string, FeedbackImage[]>> {
  const map = new Map<string, FeedbackImage[]>()
  if (feedbackIds.length === 0) return map

  const rows = await db
    .select({
      feedbackId: feedbackImages.feedbackId,
      imageUrl: feedbackImages.imageUrl,
      thumbnailUrl: feedbackImages.thumbnailUrl,
    })
    .from(feedbackImages)
    .where(and(inArray(feedbackImages.feedbackId, feedbackIds), isNull(feedbackImages.deletedAt)))
    .orderBy(asc(feedbackImages.position), asc(feedbackImages.createdAt))

  for (const row of rows) {
    const list = map.get(row.feedbackId) ?? []
    list.push({ imageUrl: row.imageUrl, thumbnailUrl: row.thumbnailUrl })
    map.set(row.feedbackId, list)
  }
  return map
}

async function insertFeedbackImages(feedbackId: string, images: { image_url: string; thumbnail_url: string }[]) {
  if (images.length === 0) return
  await db.insert(feedbackImages).values(
    images.map((img, index) => ({
      feedbackId,
      imageUrl: img.image_url,
      thumbnailUrl: img.thumbnail_url,
      position: index,
    })),
  )
}

async function findFeedback(id: string) {
  const [existing] = await db
    .select({ createdByUserId: feedback.createdByUserId })
    .from(feedback)
    .where(and(eq(feedback.id, id), isNull(feedback.deletedAt)))
    .limit(1)
  return existing ?? null
}

export async function feedbackRoutes(app: FastifyInstance) {
  app.get('/feedback', { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!

    const rows = await db
      .select({
        id: feedback.id,
        number: feedback.number,
        title: feedback.title,
        description: feedback.description,
        createdAt: feedback.createdAt,
        completedAt: feedback.completedAt,
        completionNote: feedback.completionNote,
        backloggedAt: feedback.backloggedAt,
        inProgressAt: feedback.inProgressAt,
        createdByUserId: feedback.createdByUserId,
        authorName: users.name,
      })
      .from(feedback)
      .leftJoin(users, eq(users.id, feedback.createdByUserId))
      .where(isNull(feedback.deletedAt))
      .orderBy(desc(feedback.createdAt))

    const imagesByFeedbackId = await fetchImagesByFeedbackId(rows.map((row) => row.id))

    return reply.send({
      data: rows.map((row) =>
        serializeFeedback(row, row.authorName, imagesByFeedbackId.get(row.id) ?? [], currentUser),
      ),
      has_more: false,
      next_cursor: null,
    })
  })

  app.post('/feedback', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as {
      title?: string
      description?: string
      images?: { image_url: string; thumbnail_url: string }[]
    }
    const title = body.title?.trim()
    if (!title) {
      return reply.code(400).send({ error: { message: 'title is required' } })
    }
    const images = (body.images ?? []).filter((img) => img.image_url && img.thumbnail_url)

    const currentUser = request.currentUser!
    const [created] = await db
      .insert(feedback)
      .values({
        title,
        description: body.description?.trim() || null,
        createdByUserId: currentUser.id,
      })
      .returning()

    await Promise.all([
      insertFeedbackImages(created.id, images),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'feedback_created',
        metadata: { feedbackId: created.id },
      }),
    ])

    return reply.code(201).send({
      data: serializeFeedback(
        created,
        currentUser.name,
        images.map((img) => ({ imageUrl: img.image_url, thumbnailUrl: img.thumbnail_url })),
        currentUser,
      ),
    })
  })

  app.patch('/feedback/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      title?: string
      description?: string
      images?: { image_url: string; thumbnail_url: string }[]
    }

    const currentUser = request.currentUser!
    const existing = await findFeedback(id)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Feedback not found' } })
    }
    if (!canEditFeedback(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    const title = body.title?.trim()
    if (!title) {
      return reply.code(400).send({ error: { message: 'title is required' } })
    }
    const images = (body.images ?? []).filter((img) => img.image_url && img.thumbnail_url)

    // The edit form always sends the full desired photo set (kept + newly
    // attached), so this is always a full replace, never a partial diff.
    // Nothing is hard-deleted (soft-delete convention): old rows are marked
    // deleted, not dropped, before the new set is inserted.
    const [[updated]] = await Promise.all([
      db
        .update(feedback)
        .set({ title, description: body.description?.trim() || null, updatedAt: new Date() })
        .where(eq(feedback.id, id))
        .returning(),
      db
        .update(feedbackImages)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(feedbackImages.feedbackId, id), isNull(feedbackImages.deletedAt))),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'feedback_updated',
        metadata: { feedbackId: id },
      }),
    ])
    await insertFeedbackImages(id, images)

    // currentUser is already known to be the author (canEditFeedback above),
    // and the new image set is already in hand — no need to re-query either.
    return reply.send({
      data: serializeFeedback(
        updated,
        currentUser.name,
        images.map((img) => ({ imageUrl: img.image_url, thumbnailUrl: img.thumbnail_url })),
        currentUser,
      ),
    })
  })

  app.delete('/feedback/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const currentUser = request.currentUser!

    const existing = await findFeedback(id)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Feedback not found' } })
    }
    if (!canEditFeedback(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    await Promise.all([
      db.update(feedback).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(feedback.id, id)),
      db.insert(eventsLog).values({ actor: currentUser.id, action: 'feedback_deleted', metadata: { feedbackId: id } }),
    ])

    return reply.code(204).send()
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

    const [authorRow, images] = await Promise.all([
      updated.createdByUserId
        ? db.select({ name: users.name }).from(users).where(eq(users.id, updated.createdByUserId)).limit(1)
        : Promise.resolve([]),
      fetchImagesByFeedbackId([id]),
    ])

    return reply.send({
      data: serializeFeedback(updated, authorRow[0]?.name ?? null, images.get(id) ?? [], request.currentUser!),
    })
  })

  // Backlog and in-progress are two independent non-open, non-completed
  // states (feedback #52, #79) — a deliberately-deferred item vs. one
  // that's actively blocked on Ben specifically. Both share the
  // set-timestamp-then-reload shape of /complete above, factored into one
  // helper parameterized on which column to write; setting either one
  // clears the other, since an item is only ever in one of these two states
  // at a time (same "one active state" shape backlog already had relative
  // to completedAt).
  async function setSideState(
    id: string,
    currentUser: { id: string },
    column: 'backloggedAt' | 'inProgressAt',
    value: Date | null,
    action: string,
  ) {
    const otherColumn = column === 'backloggedAt' ? 'inProgressAt' : 'backloggedAt'
    const [updated] = await db
      .update(feedback)
      .set({ [column]: value, ...(value ? { [otherColumn]: null } : {}), updatedAt: new Date() })
      .where(and(eq(feedback.id, id), isNull(feedback.deletedAt)))
      .returning()

    if (!updated) {
      return null
    }

    await db.insert(eventsLog).values({
      actor: currentUser.id,
      action,
      metadata: { feedbackId: id },
    })

    const [authorRow, images] = await Promise.all([
      updated.createdByUserId
        ? db.select({ name: users.name }).from(users).where(eq(users.id, updated.createdByUserId)).limit(1)
        : Promise.resolve([]),
      fetchImagesByFeedbackId([id]),
    ])

    return serializeFeedback(updated, authorRow[0]?.name ?? null, images.get(id) ?? [], currentUser)
  }

  app.post('/feedback/:id/backlog', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = await setSideState(id, request.currentUser!, 'backloggedAt', new Date(), 'feedback_backlogged')
    if (!data) return reply.code(404).send({ error: { message: 'Feedback not found' } })
    return reply.send({ data })
  })

  app.post('/feedback/:id/unbacklog', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = await setSideState(id, request.currentUser!, 'backloggedAt', null, 'feedback_unbacklogged')
    if (!data) return reply.code(404).send({ error: { message: 'Feedback not found' } })
    return reply.send({ data })
  })

  app.post('/feedback/:id/start-progress', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = await setSideState(id, request.currentUser!, 'inProgressAt', new Date(), 'feedback_started_progress')
    if (!data) return reply.code(404).send({ error: { message: 'Feedback not found' } })
    return reply.send({ data })
  })

  app.post('/feedback/:id/stop-progress', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = await setSideState(id, request.currentUser!, 'inProgressAt', null, 'feedback_stopped_progress')
    if (!data) return reply.code(404).send({ error: { message: 'Feedback not found' } })
    return reply.send({ data })
  })
}
