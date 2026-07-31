import { and, asc, eq, getTableColumns, gte, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { db } from '../db/client.js'
import { events, eventSources, eventStars, eventsLog } from '../db/schema.js'
import { requireAuth } from '../auth/plugin.js'

// Events are Chicago-area, so "today" for filtering out past events is
// Chicago's calendar day, not the server's (UTC) one — using UTC would drop
// today's evening events a few hours early.
function todayInChicago(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

function serializeEvent(e: typeof events.$inferSelect, starred: boolean) {
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
    starred,
  }
}

export async function eventsRoutes(app: FastifyInstance) {
  app.get('/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.currentUser?.id ?? null

    const [row] = await db
      .select({ ...getTableColumns(events), starredId: eventStars.id })
      .from(events)
      .leftJoin(
        eventStars,
        userId
          ? and(eq(eventStars.eventId, events.id), eq(eventStars.userId, userId), isNull(eventStars.deletedAt))
          : sql`false`,
      )
      .where(and(eq(events.id, id), eq(events.status, 'approved'), isNull(events.deletedAt)))
      .limit(1)

    if (!row) {
      return reply.code(404).send({ error: { message: 'Event not found' } })
    }

    return reply.send({ data: serializeEvent(row, !!row.starredId) })
  })

  app.post('/events/:id/star', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
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
        .insert(eventStars)
        .values({ userId, eventId: id })
        .onConflictDoUpdate({
          target: [eventStars.userId, eventStars.eventId],
          set: { deletedAt: null, updatedAt: new Date() },
        }),
      db.insert(eventsLog).values({ actor: userId, action: 'event_starred', metadata: { eventId: id } }),
    ])

    return reply.code(204).send()
  })

  app.delete('/events/:id/star', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.currentUser!.id

    await Promise.all([
      db
        .update(eventStars)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(eventStars.userId, userId), eq(eventStars.eventId, id), isNull(eventStars.deletedAt))),
      db.insert(eventsLog).values({ actor: userId, action: 'event_unstarred', metadata: { eventId: id } }),
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
      .select({ ...getTableColumns(events), starredId: eventStars.id })
      .from(events)
      .leftJoin(
        eventStars,
        userId
          ? and(eq(eventStars.eventId, events.id), eq(eventStars.userId, userId), isNull(eventStars.deletedAt))
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
      data: page.map((row) => serializeEvent(row, !!row.starredId)),
      has_more: hasMore,
      next_cursor: nextCursor,
    })
  })
}
