import { and, asc, desc, eq, inArray, isNull, sql, type SQLWrapper } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { db } from '../db/client.js'
import { eventsLog, feedback, feedbackComments, feedbackImages, users } from '../db/schema.js'
import { requireAuth, requireRole } from '../auth/plugin.js'
import { canEditFeedback } from './permissions.js'

type FeedbackImage = { imageUrl: string; thumbnailUrl: string }

// Scalar subquery, not a join — same pattern as events/routes.ts's
// interestedCountExpr. The outer queries below all already join `users`, so
// drizzle table-qualifies `${feedbackId}` correctly (see that file's own
// caution comment on this gotcha).
function commentCountExpr(feedbackId: SQLWrapper) {
  return sql<number>`(select count(*)::int from ${feedbackComments} where ${feedbackComments.feedbackId} = ${feedbackId} and ${feedbackComments.deletedAt} is null)`
}

function serializeFeedback(
  f: Pick<
    typeof feedback.$inferSelect,
    'id' | 'number' | 'title' | 'description' | 'createdAt' | 'completedAt' | 'backloggedAt' | 'inProgressAt' | 'createdByUserId'
  >,
  authorName: string | null,
  images: FeedbackImage[],
  commentCount: number,
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
    backlogged_at: f.backloggedAt,
    in_progress_at: f.inProgressAt,
    comment_count: commentCount,
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

// Shared "write a column patch, log it, reload with author+images, return
// the serialized row" shape behind /complete and the backlog/in-progress
// toggles below — the actual column(s) written and the log action are the
// only things that differ per caller.
async function updateFeedbackAndSerialize(
  id: string,
  patch: Partial<typeof feedback.$inferInsert>,
  action: string,
  currentUser: { id: string },
) {
  const [updated] = await db
    .update(feedback)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(feedback.id, id), isNull(feedback.deletedAt)))
    .returning()

  if (!updated) return null

  await db.insert(eventsLog).values({ actor: currentUser.id, action, metadata: { feedbackId: id } })

  const [authorRow, images, commentCount] = await Promise.all([
    updated.createdByUserId
      ? db.select({ name: users.name }).from(users).where(eq(users.id, updated.createdByUserId)).limit(1)
      : Promise.resolve([]),
    fetchImagesByFeedbackId([id]),
    fetchCommentCount(id),
  ])

  return serializeFeedback(updated, authorRow[0]?.name ?? null, images.get(id) ?? [], commentCount, currentUser)
}

async function fetchCommentCount(id: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackComments)
    .where(and(eq(feedbackComments.feedbackId, id), isNull(feedbackComments.deletedAt)))
  return row?.count ?? 0
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
        backloggedAt: feedback.backloggedAt,
        inProgressAt: feedback.inProgressAt,
        createdByUserId: feedback.createdByUserId,
        authorName: users.name,
        commentCount: commentCountExpr(feedback.id),
      })
      .from(feedback)
      .leftJoin(users, eq(users.id, feedback.createdByUserId))
      .where(isNull(feedback.deletedAt))
      .orderBy(desc(feedback.createdAt))

    const imagesByFeedbackId = await fetchImagesByFeedbackId(rows.map((row) => row.id))

    return reply.send({
      data: rows.map((row) =>
        serializeFeedback(row, row.authorName, imagesByFeedbackId.get(row.id) ?? [], row.commentCount, currentUser),
      ),
      has_more: false,
      next_cursor: null,
    })
  })

  // Powers FeedbackDetailPage (feedback #98) — the one place a single
  // item's full content + comment thread is shown, mirroring
  // GET /events/:id / GET /camps/:id.
  app.get('/feedback/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const currentUser = request.currentUser!

    const [row] = await db
      .select({
        id: feedback.id,
        number: feedback.number,
        title: feedback.title,
        description: feedback.description,
        createdAt: feedback.createdAt,
        completedAt: feedback.completedAt,
        backloggedAt: feedback.backloggedAt,
        inProgressAt: feedback.inProgressAt,
        createdByUserId: feedback.createdByUserId,
        authorName: users.name,
        commentCount: commentCountExpr(feedback.id),
      })
      .from(feedback)
      .leftJoin(users, eq(users.id, feedback.createdByUserId))
      .where(and(eq(feedback.id, id), isNull(feedback.deletedAt)))
      .limit(1)

    if (!row) {
      return reply.code(404).send({ error: { message: 'Feedback not found' } })
    }

    const images = await fetchImagesByFeedbackId([id])
    return reply.send({ data: serializeFeedback(row, row.authorName, images.get(id) ?? [], row.commentCount, currentUser) })
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
        0,
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
    const commentCount = await fetchCommentCount(id)

    // currentUser is already known to be the author (canEditFeedback above),
    // and the new image set is already in hand — no need to re-query either.
    return reply.send({
      data: serializeFeedback(
        updated,
        currentUser.name,
        images.map((img) => ({ imageUrl: img.image_url, thumbnailUrl: img.thumbnail_url })),
        commentCount,
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

  // One click, no confirmation step (feedback, 2026-08-16: "accidental
  // clicks are unlikely"). Admin commentary now happens as an ordinary reply
  // in the item's comment thread (feedback #98) rather than a dedicated
  // note field/route — see feedback/comments.ts.
  app.post('/feedback/:id/complete', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = await updateFeedbackAndSerialize(
      id,
      { completedAt: new Date(), completedByUserId: request.currentUser!.id },
      'feedback_completed',
      request.currentUser!,
    )
    if (!data) return reply.code(404).send({ error: { message: 'Feedback not found' } })
    return reply.send({ data })
  })

  // Backlog and in-progress are two independent non-open, non-completed
  // states (feedback #52, #79) — a deliberately-deferred item vs. one
  // that's actively blocked on Ben specifically. Both share
  // updateFeedbackAndSerialize's set-column-then-reload shape above;
  // setting either one clears the other, since an item is only ever in one
  // of these two states at a time (same "one active state" shape backlog
  // already had relative to completedAt).
  function setSideState(id: string, currentUser: { id: string }, column: 'backloggedAt' | 'inProgressAt', value: Date | null, action: string) {
    const otherColumn = column === 'backloggedAt' ? 'inProgressAt' : 'backloggedAt'
    return updateFeedbackAndSerialize(id, { [column]: value, ...(value ? { [otherColumn]: null } : {}) }, action, currentUser)
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
