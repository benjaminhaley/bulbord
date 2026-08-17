import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { db } from '../db/client.js'
import { feedback, feedbackComments, feedbackCommentImages, eventsLog, users } from '../db/schema.js'
import { canDeleteFeedbackComment, canEditFeedbackComment } from './comment-permissions.js'
import { notifyFeedbackReply } from './notifications.js'

type CommentImage = { imageUrl: string; thumbnailUrl: string }

async function findComment(feedbackId: string, commentId: string) {
  const [existing] = await db
    .select({ userId: feedbackComments.userId })
    .from(feedbackComments)
    .where(and(eq(feedbackComments.id, commentId), eq(feedbackComments.feedbackId, feedbackId), isNull(feedbackComments.deletedAt)))
    .limit(1)
  return existing ?? null
}

// Same batched-by-parent-id shape as feedback/routes.ts's
// fetchImagesByFeedbackId, one level down (per-comment instead of
// per-post) — a reply can carry more than one photo (feedback, 2026-08-17)
// same as the post itself.
async function fetchImagesByCommentId(commentIds: string[]): Promise<Map<string, CommentImage[]>> {
  const map = new Map<string, CommentImage[]>()
  if (commentIds.length === 0) return map

  const rows = await db
    .select({
      feedbackCommentId: feedbackCommentImages.feedbackCommentId,
      imageUrl: feedbackCommentImages.imageUrl,
      thumbnailUrl: feedbackCommentImages.thumbnailUrl,
    })
    .from(feedbackCommentImages)
    .where(and(inArray(feedbackCommentImages.feedbackCommentId, commentIds), isNull(feedbackCommentImages.deletedAt)))
    .orderBy(asc(feedbackCommentImages.position), asc(feedbackCommentImages.createdAt))

  for (const row of rows) {
    const list = map.get(row.feedbackCommentId) ?? []
    list.push({ imageUrl: row.imageUrl, thumbnailUrl: row.thumbnailUrl })
    map.set(row.feedbackCommentId, list)
  }
  return map
}

async function insertCommentImages(commentId: string, images: { image_url: string; thumbnail_url: string }[]) {
  if (images.length === 0) return
  await db.insert(feedbackCommentImages).values(
    images.map((img, index) => ({
      feedbackCommentId: commentId,
      imageUrl: img.image_url,
      thumbnailUrl: img.thumbnail_url,
      position: index,
    })),
  )
}

function serializeComment(
  c: Pick<typeof feedbackComments.$inferSelect, 'id' | 'feedbackId' | 'userId' | 'body' | 'createdAt' | 'updatedAt'>,
  authorName: string | null,
  authorAvatarUrl: string | null,
  images: CommentImage[],
  currentUser: { id: string; roles: string[] } | null,
) {
  return {
    id: c.id,
    feedback_id: c.feedbackId,
    body: c.body,
    images: images.map((img) => ({ image_url: img.imageUrl, thumbnail_url: img.thumbnailUrl })),
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
// post's own author gets a notification (in-app + email — see
// feedback/notifications.ts's notifyFeedbackReply, backed by the unified
// notifications table, feedback #100) when someone other than themselves
// replies. No stored `notify` flag is needed here the way user_connections
// has one — unlike a mutual-follow edge, there's no "this would be a
// surprise to no one" case to special-case: every comment from someone other
// than the feedback's own author is notify-worthy for that author.
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
      // Oldest first, newest last — standard chat-thread order (feedback,
      // 2026-08-17: "have replies come in so the oldest is at the bottom"),
      // matching the compose box's own position below the list, so a
      // reply just posted appears right where the member was looking, not
      // at the top of the thread.
      .orderBy(asc(feedbackComments.createdAt))

    const imagesByCommentId = await fetchImagesByCommentId(rows.map((row) => row.id))

    return reply.send({
      data: rows.map((row) =>
        serializeComment(row, row.authorName, row.authorAvatarUrl, imagesByCommentId.get(row.id) ?? [], currentUser),
      ),
      has_more: false,
      next_cursor: null,
    })
  })

  app.post('/feedback/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { body?: string; images?: { image_url: string; thumbnail_url: string }[] }
    const text = body.body?.trim()
    if (!text) {
      return reply.code(400).send({ error: { message: 'body is required' } })
    }
    const images = (body.images ?? []).filter((img) => img.image_url && img.thumbnail_url)

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

    await Promise.all([
      insertCommentImages(created.id, images),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'feedback_comment_created',
        metadata: { feedbackId: id, commentId: created.id },
      }),
    ])

    // Best-effort, not awaited into the response — a failed send shouldn't
    // hold up or fail the reply itself (feedback #98's email addendum, see
    // notifications.ts for the full reasoning). Passes the already-known
    // image URLs straight through rather than having the notifier re-query
    // for what was just inserted.
    notifyFeedbackReply(
      id,
      currentUser.id,
      text,
      images.map((img) => img.image_url),
    ).catch((err) => {
      console.error('feedback reply email failed', err)
    })

    const createdImages = images.map((img) => ({ imageUrl: img.image_url, thumbnailUrl: img.thumbnail_url }))
    return reply
      .code(201)
      .send({ data: serializeComment(created, currentUser.name, currentUser.avatarUrl, createdImages, currentUser) })
  })

  app.patch('/feedback/:id/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, commentId } = request.params as { id: string; commentId: string }
    const body = request.body as { body?: string; images?: { image_url: string; thumbnail_url: string }[] }
    const text = body.body?.trim()
    if (!text) {
      return reply.code(400).send({ error: { message: 'body is required' } })
    }
    const images = (body.images ?? []).filter((img) => img.image_url && img.thumbnail_url)

    const currentUser = request.currentUser!
    const existing = await findComment(id, commentId)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Comment not found' } })
    }
    if (!canEditFeedbackComment(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    // Same full-replace posture as feedback post edits (PATCH /feedback/:id)
    // — the edit form always resends the complete desired photo set, so old
    // rows are soft-deleted and the new set inserted fresh rather than
    // reconciled as an add/remove diff.
    const [[updated]] = await Promise.all([
      db.update(feedbackComments).set({ body: text, updatedAt: new Date() }).where(eq(feedbackComments.id, commentId)).returning(),
      db
        .update(feedbackCommentImages)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(feedbackCommentImages.feedbackCommentId, commentId), isNull(feedbackCommentImages.deletedAt))),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'feedback_comment_updated',
        metadata: { feedbackId: id, commentId },
      }),
    ])
    await insertCommentImages(commentId, images)

    const updatedImages = images.map((img) => ({ imageUrl: img.image_url, thumbnailUrl: img.thumbnail_url }))
    return reply.send({ data: serializeComment(updated, currentUser.name, currentUser.avatarUrl, updatedImages, currentUser) })
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
