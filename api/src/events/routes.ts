import { and, asc, eq, getTableColumns, gte, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { db } from '../db/client.js'
import { events, eventSources, eventInterests, eventsLog } from '../db/schema.js'
import { requireAuth } from '../auth/plugin.js'

type InterestStatus = 'interested' | 'dismissed'

// Events are Chicago-area, so "today" for filtering out past events is
// Chicago's calendar day, not the server's (UTC) one — using UTC would drop
// today's evening events a few hours early.
function todayInChicago(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

function serializeEvent(e: typeof events.$inferSelect, interestStatus: InterestStatus | null) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    start_date: e.startDate,
    start_time: e.startTime,
    all_day: e.allDay,
    address: e.address,
    location_name: e.locationName,
    latitude: e.latitude,
    longitude: e.longitude,
    source_url: e.sourceUrl,
    image_url: e.imageUrl,
    thumbnail_url: e.thumbnailUrl,
    interest_status: interestStatus,
  }
}

export async function eventsRoutes(app: FastifyInstance) {
  app.get('/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.currentUser?.id ?? null

    const [row] = await db
      .select({ ...getTableColumns(events), interestStatus: eventInterests.status })
      .from(events)
      .leftJoin(
        eventInterests,
        userId
          ? and(eq(eventInterests.eventId, events.id), eq(eventInterests.userId, userId), isNull(eventInterests.deletedAt))
          : sql`false`,
      )
      .where(and(eq(events.id, id), eq(events.status, 'approved'), isNull(events.deletedAt)))
      .limit(1)

    if (!row) {
      return reply.code(404).send({ error: { message: 'Event not found' } })
    }

    return reply.send({ data: serializeEvent(row, row.interestStatus as InterestStatus | null) })
  })

  app.put('/events/:id/interest', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status?: string }
    if (status !== 'interested' && status !== 'dismissed') {
      return reply.code(400).send({ error: { message: 'status must be "interested" or "dismissed"' } })
    }
    const userId = request.currentUser!.id

    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1)
    if (!event) {
      return reply.code(404).send({ error: { message: 'Event not found' } })
    }

    await Promise.all([
      db
        .insert(eventInterests)
        .values({ userId, eventId: id, status })
        .onConflictDoUpdate({
          target: [eventInterests.userId, eventInterests.eventId],
          set: { status, deletedAt: null, updatedAt: new Date() },
        }),
      db.insert(eventsLog).values({
        actor: userId,
        action: status === 'interested' ? 'event_interested' : 'event_dismissed',
        metadata: { eventId: id },
      }),
    ])

    return reply.code(204).send()
  })

  app.delete('/events/:id/interest', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.currentUser!.id

    await Promise.all([
      db
        .update(eventInterests)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(eventInterests.userId, userId), eq(eventInterests.eventId, id), isNull(eventInterests.deletedAt))),
      db.insert(eventsLog).values({ actor: userId, action: 'event_interest_cleared', metadata: { eventId: id } }),
    ])

    return reply.code(204).send()
  })

  app.get('/event-sources', async (_request, reply) => {
    const rows = await db
      .select({ id: eventSources.id, name: eventSources.name, url: eventSources.url, type: eventSources.type })
      .from(eventSources)
      .where(and(eq(eventSources.isActive, true), isNull(eventSources.deletedAt)))
      .orderBy(asc(eventSources.name))

    return reply.send({ data: rows, has_more: false, next_cursor: null })
  })

  app.get('/events', async (request, reply) => {
    const query = request.query as { limit?: string; cursor?: string }
    const limit = Math.min(Number(query.limit) || 20, 100)
    const userId = request.currentUser?.id ?? null

    let cursorStartDate: string | null = null
    let cursorId: string | null = null
    if (query.cursor) {
      const [startDate, id] = Buffer.from(query.cursor, 'base64url').toString('utf8').split('|')
      cursorStartDate = startDate ?? null
      cursorId = id ?? null
    }

    const conditions = [eq(events.status, 'approved'), isNull(events.deletedAt), gte(events.startDate, todayInChicago())]
    if (cursorStartDate && cursorId) {
      conditions.push(sql`(${events.startDate}, ${events.id}) > (${cursorStartDate}, ${cursorId})`)
    }

    const rows = await db
      .select({ ...getTableColumns(events), interestStatus: eventInterests.status })
      .from(events)
      .leftJoin(
        eventInterests,
        userId
          ? and(eq(eventInterests.eventId, events.id), eq(eventInterests.userId, userId), isNull(eventInterests.deletedAt))
          : sql`false`,
      )
      .where(and(...conditions))
      .orderBy(asc(events.startDate), asc(events.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    const nextCursor = hasMore && last ? Buffer.from(`${last.startDate}|${last.id}`).toString('base64url') : null

    return reply.send({
      data: page.map((row) => serializeEvent(row, row.interestStatus as InterestStatus | null)),
      has_more: hasMore,
      next_cursor: nextCursor,
    })
  })
}
