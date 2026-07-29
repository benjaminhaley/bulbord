import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { db } from '../db/client.js'
import { events, eventSources } from '../db/schema.js'

function serializeEvent(e: typeof events.$inferSelect) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    start_date: e.startDate,
    start_time: e.startTime,
    all_day: e.allDay,
    address: e.address,
    latitude: e.latitude,
    longitude: e.longitude,
    source_url: e.sourceUrl,
  }
}

export async function eventsRoutes(app: FastifyInstance) {
  app.get('/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, id), eq(events.status, 'approved'), isNull(events.deletedAt)))
      .limit(1)

    if (!event) {
      return reply.code(404).send({ error: { message: 'Event not found' } })
    }

    return reply.send({ data: serializeEvent(event) })
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

    let cursorStartDate: string | null = null
    let cursorId: string | null = null
    if (query.cursor) {
      const [startDate, id] = Buffer.from(query.cursor, 'base64url').toString('utf8').split('|')
      cursorStartDate = startDate ?? null
      cursorId = id ?? null
    }

    const conditions = [eq(events.status, 'approved'), isNull(events.deletedAt)]
    if (cursorStartDate && cursorId) {
      conditions.push(sql`(${events.startDate}, ${events.id}) > (${cursorStartDate}, ${cursorId})`)
    }

    const rows = await db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(asc(events.startDate), asc(events.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    const nextCursor = hasMore && last ? Buffer.from(`${last.startDate}|${last.id}`).toString('base64url') : null

    return reply.send({
      data: page.map(serializeEvent),
      has_more: hasMore,
      next_cursor: nextCursor,
    })
  })
}
