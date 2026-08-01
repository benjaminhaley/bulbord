import { and, asc, desc, eq, getTableColumns, gte, isNull, sql, type SQLWrapper } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { db } from '../db/client.js'
import { events, eventSources, eventInterests, eventsLog, users } from '../db/schema.js'
import { requireAuth } from '../auth/plugin.js'

type InterestStatus = 'interested' | 'dismissed'

// Events are Chicago-area, so "today" for filtering out past events is
// Chicago's calendar day, not the server's (UTC) one — using UTC would drop
// today's evening events a few hours early.
function todayInChicago(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

type SerializableEvent = Pick<
  typeof events.$inferSelect,
  | 'id'
  | 'title'
  | 'description'
  | 'startDate'
  | 'startTime'
  | 'allDay'
  | 'address'
  | 'locationName'
  | 'latitude'
  | 'longitude'
  | 'sourceUrl'
  | 'imageUrl'
  | 'thumbnailUrl'
>

function serializeEvent(e: SerializableEvent, interestStatus: InterestStatus | null, interestedCount: number) {
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
    interested_count: interestedCount,
  }
}

// Correlated scalar subquery — fine for a single row (GET /events/:id), but
// the paginated list route below aggregates via a joined CTE instead so it
// doesn't re-scan event_interests once per returned row.
function interestedCountExpr(eventId: SQLWrapper) {
  return sql<number>`(select count(*)::int from ${eventInterests} where ${eventInterests.eventId} = ${eventId} and ${eventInterests.status} = 'interested' and ${eventInterests.deletedAt} is null)`
}

// "Stale" flags a source the ingestion pipeline hasn't turned up anything new
// from recently — a signal the source may have gone quiet or broken, not a
// judgment about the events themselves (which can be far in the future).
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000
function isSourceStale(lastEventAddedAt: Date | null): boolean {
  return !lastEventAddedAt || Date.now() - lastEventAddedAt.getTime() > STALE_THRESHOLD_MS
}

export async function eventsRoutes(app: FastifyInstance) {
  app.get('/events/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.currentUser?.id ?? null

    const [row] = await db
      .select({
        ...getTableColumns(events),
        interestStatus: eventInterests.status,
        interestedCount: interestedCountExpr(events.id),
      })
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

    return reply.send({ data: serializeEvent(row, row.interestStatus as InterestStatus | null, row.interestedCount) })
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

  app.get('/event-sources', { preHandler: requireAuth }, async (_request, reply) => {
    const rows = await db
      .select({ id: eventSources.id, name: eventSources.name, url: eventSources.url, type: eventSources.type })
      .from(eventSources)
      .where(and(eq(eventSources.isActive, true), isNull(eventSources.deletedAt)))
      .orderBy(asc(eventSources.name))

    return reply.send({ data: rows, has_more: false, next_cursor: null })
  })

  app.get('/event-sources/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sourceConditions = and(eq(events.sourceId, id), isNull(events.deletedAt))

    const [[source], sourceEvents, [{ lastEventAddedAt }]] = await Promise.all([
      db
        .select()
        .from(eventSources)
        .where(and(eq(eventSources.id, id), isNull(eventSources.deletedAt)))
        .limit(1),
      db
        .select({ id: events.id, title: events.title, startDate: events.startDate, status: events.status })
        .from(events)
        .where(sourceConditions)
        .orderBy(desc(events.startDate)),
      // The postgres.js driver returns a raw, untyped `sql` aggregate as a
      // string rather than a Date, unlike drizzle-mapped table columns.
      db.select({ lastEventAddedAt: sql<string | null>`max(${events.createdAt})` }).from(events).where(sourceConditions),
    ])

    if (!source) {
      return reply.code(404).send({ error: { message: 'Source not found' } })
    }

    return reply.send({
      data: {
        id: source.id,
        name: source.name,
        url: source.url,
        type: source.type,
        notes: source.notes,
        is_active: source.isActive,
        last_checked_at: source.lastCheckedAt,
        last_event_added_at: lastEventAddedAt,
        is_stale: isSourceStale(lastEventAddedAt ? new Date(lastEventAddedAt) : null),
        events: sourceEvents.map((e) => ({ id: e.id, title: e.title, start_date: e.startDate, status: e.status })),
      },
    })
  })

  app.get('/events', { preHandler: requireAuth }, async (request, reply) => {
    const query = request.query as { limit?: string; cursor?: string }
    const limit = Math.min(Number(query.limit) || 20, 100)
    const userId = request.currentUser?.id ?? null

    let cursorStartDate: string | null = null
    let cursorSortTime: string | null = null
    let cursorId: string | null = null
    if (query.cursor) {
      const [startDate, sortTime, id] = Buffer.from(query.cursor, 'base64url').toString('utf8').split('|')
      cursorStartDate = startDate ?? null
      cursorSortTime = sortTime ?? null
      cursorId = id ?? null
    }

    const conditions = [eq(events.status, 'approved'), isNull(events.deletedAt), gte(events.startDate, todayInChicago())]

    // Events with no specific start_time (null = no specific time, distinct
    // from all_day — see CLAUDE.md) sort after every timed event on the same
    // day, since we can't place them chronologically within the day.
    const sortTimeExpr = sql`coalesce(${events.startTime}, '23:59:59'::time)`

    // A recurring event (e.g. "Weekly Story Time") is ingested as one row per
    // occurrence sharing the same (title, source_url) — see CLAUDE.md's
    // ingestion dedup key. Rank occurrences within each series by date and
    // keep only the soonest upcoming one; later occurrences resurface on
    // their own once the current one passes and drops out of the `gte`
    // filter above. Events with no source_url (user submissions) fall into
    // their own single-row partition via the id fallback, so same-titled
    // one-off suggestions are never collapsed together.
    const nextOccurrence = db.$with('next_occurrence').as(
      db
        .select({
          ...getTableColumns(events),
          rn: sql<number>`row_number() over (partition by ${events.title}, coalesce(${events.sourceUrl}, ${events.id}::text) order by ${events.startDate} asc, ${sortTimeExpr} asc, ${events.id} asc)`.as(
            'rn',
          ),
          sortTime: sortTimeExpr.as('sort_time'),
        })
        .from(events)
        .where(and(...conditions)),
    )

    // Pre-aggregated once via GROUP BY rather than a correlated subquery
    // re-run per returned row — cheaper on the paginated list than the
    // single-row interestedCountExpr used by GET /events/:id above.
    const interestCounts = db.$with('interest_counts').as(
      db
        .select({
          eventId: eventInterests.eventId,
          interestedCount: sql<number>`count(*) filter (where ${eventInterests.status} = 'interested')`.as('interested_count'),
        })
        .from(eventInterests)
        .where(isNull(eventInterests.deletedAt))
        .groupBy(eventInterests.eventId),
    )

    const rows = await db
      .with(nextOccurrence, interestCounts)
      .select({
        id: nextOccurrence.id,
        title: nextOccurrence.title,
        description: nextOccurrence.description,
        startDate: nextOccurrence.startDate,
        startTime: nextOccurrence.startTime,
        allDay: nextOccurrence.allDay,
        address: nextOccurrence.address,
        locationName: nextOccurrence.locationName,
        latitude: nextOccurrence.latitude,
        longitude: nextOccurrence.longitude,
        sourceUrl: nextOccurrence.sourceUrl,
        imageUrl: nextOccurrence.imageUrl,
        thumbnailUrl: nextOccurrence.thumbnailUrl,
        interestStatus: eventInterests.status,
        interestedCount: sql<number>`coalesce(${interestCounts.interestedCount}, 0)`,
        sortTime: nextOccurrence.sortTime,
      })
      .from(nextOccurrence)
      .leftJoin(
        eventInterests,
        userId
          ? and(eq(eventInterests.eventId, nextOccurrence.id), eq(eventInterests.userId, userId), isNull(eventInterests.deletedAt))
          : sql`false`,
      )
      .leftJoin(interestCounts, eq(interestCounts.eventId, nextOccurrence.id))
      .where(
        cursorStartDate && cursorSortTime && cursorId
          ? and(
              eq(nextOccurrence.rn, 1),
              sql`(${nextOccurrence.startDate}, ${nextOccurrence.sortTime}, ${nextOccurrence.id}) > (${cursorStartDate}, ${cursorSortTime}::time, ${cursorId})`,
            )
          : eq(nextOccurrence.rn, 1),
      )
      .orderBy(asc(nextOccurrence.startDate), asc(nextOccurrence.sortTime), asc(nextOccurrence.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    const nextCursor =
      hasMore && last ? Buffer.from(`${last.startDate}|${last.sortTime}|${last.id}`).toString('base64url') : null

    return reply.send({
      data: page.map((row) => serializeEvent(row, row.interestStatus as InterestStatus | null, row.interestedCount)),
      has_more: hasMore,
      next_cursor: nextCursor,
    })
  })

  // Attendance-signal social proof only (see CLAUDE.md's data classification) —
  // name and avatar, never contact info — mirroring the invited-by list already
  // exposed in the admin users view.
  app.get('/events/:id/interested', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const rows = await db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(eventInterests)
      .innerJoin(users, eq(users.id, eventInterests.userId))
      .where(and(eq(eventInterests.eventId, id), eq(eventInterests.status, 'interested'), isNull(eventInterests.deletedAt)))
      .orderBy(asc(eventInterests.createdAt))

    return reply.send({
      data: rows.map((row) => ({ id: row.id, name: row.name, avatar_url: row.avatarUrl })),
    })
  })
}
