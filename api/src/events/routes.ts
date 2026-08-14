import { and, asc, eq, getTableColumns, gte, isNull, sql, type SQLWrapper } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { db } from '../db/client.js'
import { events, eventSources, eventInterests, eventsLog, users } from '../db/schema.js'
import { todayInChicago } from '../dates.js'
// Reused rather than duplicated for the preview-meta route below (feedback
// #73 follow-up) — these are the existing, already-tested formatters, just
// living in newsletter/ for historical reasons (their byte-identical-parity
// requirement is with web/src/events/format.ts, not with anything
// newsletter-specific — see that file's own header).
import { formatWhen, locationLabel } from '../newsletter/format.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { canEditEvent } from './permissions.js'

type InterestStatus = 'interested' | 'dismissed'

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
  | 'submittedByUserId'
>

// Small icon-stack teaser (feedback #43 — replaced a text-name teaser), so
// the closed state needs a photo/initials per person, not just a name.
export type InterestedPersonSummary = { name: string; avatar_url: string | null }

// null for system-sourced events (no submitter to show); present for member
// self-service posts (feedback #46), so the frontend can attribute the post
// and fall back to the poster's own photo as a placeholder image when the
// event has no image of its own (feedback, 2026-08-03).
export type SubmitterSummary = { name: string; avatar_url: string | null }

function serializeEvent(
  e: SerializableEvent,
  interestStatus: InterestStatus | null,
  interestedCount: number,
  interestedPeople: InterestedPersonSummary[],
  currentUserId: string | null,
  submittedBy: SubmitterSummary | null,
) {
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
    interested_people: interestedPeople,
    // Creator-only edit/delete (feedback #46) — no admin override, same
    // posture as feedback-post edits (feedback #39).
    can_edit: currentUserId !== null && canEditEvent({ id: currentUserId }, e),
    submitted_by: submittedBy,
  }
}

// Correlated scalar subqueries — fine for a single row (GET /events/:id), but
// the paginated list route below aggregates via a joined CTE instead so it
// doesn't re-scan event_interests once per returned row.
//
// CAUTION: drizzle only table-qualifies a raw sql`` column interpolation
// (e.g. the `${eventId}` below) when the surrounding query already involves
// more than one table — GET /events/:id's outer query happens to already
// left-join event_interests, which is the only reason `${eventId}` renders
// as "events"."id" instead of a bare "id" that would wrongly resolve to
// event_interests' own id column inside this subquery. A caller with a
// single-table outer query would silently get that wrong (see the
// event_count fix on GET /event-sources, which hit exactly this and had to
// use a real join instead) — don't reuse these two helpers from one.
function interestedCountExpr(eventId: SQLWrapper) {
  return sql<number>`(select count(*)::int from ${eventInterests} where ${eventInterests.eventId} = ${eventId} and ${eventInterests.status} = 'interested' and ${eventInterests.deletedAt} is null)`
}

// Name+avatar in interest-order, with the current viewer's own name swapped
// for "You" — same substitution the paginated list's interest_people CTE
// applies. Carries avatar_url (not just name) so the closed-state teaser can
// render a small icon stack instead of text (feedback #43).
function interestedPeopleExpr(eventId: SQLWrapper, userId: string | null) {
  return sql<InterestedPersonSummary[]>`(select coalesce(json_agg(json_build_object('name', case when ${eventInterests.userId} = ${userId} then 'You' else ${users.name} end, 'avatar_url', ${users.avatarUrl}) order by ${eventInterests.createdAt}), '[]'::json) from ${eventInterests} join ${users} on ${users.id} = ${eventInterests.userId} where ${eventInterests.eventId} = ${eventId} and ${eventInterests.status} = 'interested' and ${eventInterests.deletedAt} is null)`
}

// Scalar subquery, not a join — mirrors interestedCountExpr/interestedPeopleExpr
// above. Naturally yields SQL NULL (not an error) when submittedByUserId
// itself is NULL (system-sourced events), since the WHERE clause then
// matches no row.
function submittedByExpr(submittedByUserId: SQLWrapper) {
  return sql<SubmitterSummary | null>`(select json_build_object('name', ${users.name}, 'avatar_url', ${users.avatarUrl}) from ${users} where ${users.id} = ${submittedByUserId})`
}

// "Stale" flags a source the ingestion pipeline hasn't turned up anything new
// from recently — a signal the source may have gone quiet or broken, not a
// judgment about the events themselves (which can be far in the future).
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000
function isSourceStale(lastEventAddedAt: Date | null): boolean {
  return !lastEventAddedAt || Date.now() - lastEventAddedAt.getTime() > STALE_THRESHOLD_MS
}


// Shared by GET /events/:id and the POST/PATCH /events responses below,
// which need to hand back the same fully-hydrated (interest status/count/
// people) shape a client would get from re-fetching the detail page.
async function loadEventDetail(id: string, userId: string | null) {
  const [row] = await db
    .select({
      ...getTableColumns(events),
      interestStatus: eventInterests.status,
      interestedCount: interestedCountExpr(events.id),
      interestedPeople: interestedPeopleExpr(events.id, userId),
      submittedBy: submittedByExpr(events.submittedByUserId),
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
  return row ?? null
}

export async function eventsRoutes(app: FastifyInstance) {
  // Public, unauthenticated on purpose (feedback #73): a link-preview
  // crawler (iMessage, WhatsApp, Slack, etc.) that fetches a shared event
  // URL is never logged in, so a rich share preview needs some way to reach
  // event data without a session — same narrow-public-data pattern as
  // GET /invites/:userId (see CLAUDE.md's Login section). title/description/
  // image/schedule/location are all already member-visible listing data
  // (see CLAUDE.md's Data safety & classification) — restricted data
  // (attendee/interest info) is never exposed here, and everything else
  // stays behind requireAuth. Only an approved, non-deleted event is
  // eligible, same as the real detail route.
  app.get('/events/:id/preview-meta', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await db
      .select({
        title: events.title,
        description: events.description,
        imageUrl: events.imageUrl,
        thumbnailUrl: events.thumbnailUrl,
        startDate: events.startDate,
        startTime: events.startTime,
        allDay: events.allDay,
        address: events.address,
        locationName: events.locationName,
      })
      .from(events)
      .where(and(eq(events.id, id), eq(events.status, 'approved'), isNull(events.deletedAt)))
      .limit(1)
    if (!row) {
      return reply.code(404).send({ error: { message: 'Event not found' } })
    }
    return reply.send({
      data: {
        title: row.title,
        description: row.description,
        image_url: row.imageUrl ?? row.thumbnailUrl,
        when: formatWhen({ startDate: row.startDate, startTime: row.startTime, allDay: row.allDay }),
        location: locationLabel({ address: row.address, locationName: row.locationName }),
      },
    })
  })

  app.get('/events/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.currentUser?.id ?? null

    const row = await loadEventDetail(id, userId)
    if (!row) {
      return reply.code(404).send({ error: { message: 'Event not found' } })
    }

    return reply.send({
      data: serializeEvent(
        row,
        row.interestStatus as InterestStatus | null,
        row.interestedCount,
        row.interestedPeople,
        userId,
        row.submittedBy,
      ),
    })
  })

  // Member self-service event posting (feedback #46) — goes live immediately,
  // no pending/approval step, unlike sourced/admin-suggested events (see
  // CLAUDE.md's Product shape vs. this route's own note in CLAUDE.md). Only
  // title, address ("location"), and start_date are required; everything
  // else is optional.
  app.post('/events', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as {
      title?: string
      description?: string
      start_date?: string
      start_time?: string
      all_day?: boolean
      address?: string
      location_name?: string
      source_url?: string
      image_url?: string
      thumbnail_url?: string
    }
    const title = body.title?.trim()
    const address = body.address?.trim()
    const startDate = body.start_date?.trim()
    if (!title || !address || !startDate) {
      return reply.code(400).send({ error: { message: 'title, address, and start_date are required' } })
    }

    const currentUser = request.currentUser!
    const allDay = !!body.all_day
    // events.image_url/thumbnail_url are NOT NULL — a member who doesn't
    // attach a photo still gets a generated placeholder (uploads/placeholder.ts),
    // same as every other insert path.
    const image =
      body.image_url && body.thumbnail_url
        ? { imageUrl: body.image_url, thumbnailUrl: body.thumbnail_url }
        : await uploadPlaceholderImage(title, 'events')
    const [created] = await db
      .insert(events)
      .values({
        title,
        description: body.description?.trim() || null,
        startDate,
        startTime: allDay ? null : body.start_time?.trim() || null,
        allDay,
        address,
        locationName: body.location_name?.trim() || null,
        sourceUrl: body.source_url?.trim() || null,
        imageUrl: image.imageUrl,
        thumbnailUrl: image.thumbnailUrl,
        status: 'approved',
        submittedByUserId: currentUser.id,
      })
      .returning({ id: events.id })

    await db.insert(eventsLog).values({
      actor: currentUser.id,
      action: 'event_created',
      metadata: { eventId: created.id },
    })

    const row = (await loadEventDetail(created.id, currentUser.id))!
    return reply.code(201).send({
      data: serializeEvent(
        row,
        row.interestStatus as InterestStatus | null,
        row.interestedCount,
        row.interestedPeople,
        currentUser.id,
        row.submittedBy,
      ),
    })
  })

  app.patch('/events/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      title?: string
      description?: string
      start_date?: string
      start_time?: string
      all_day?: boolean
      address?: string
      location_name?: string
      source_url?: string
      image_url?: string
      thumbnail_url?: string
    }

    const currentUser = request.currentUser!
    const [existing] = await db
      .select({ submittedByUserId: events.submittedByUserId })
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Event not found' } })
    }
    if (!canEditEvent(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    const title = body.title?.trim()
    const address = body.address?.trim()
    const startDate = body.start_date?.trim()
    if (!title || !address || !startDate) {
      return reply.code(400).send({ error: { message: 'title, address, and start_date are required' } })
    }

    const allDay = !!body.all_day
    // Same NOT NULL fallback as POST /events above — clearing a photo on
    // edit still leaves a real (generated) image behind, never null.
    const image =
      body.image_url && body.thumbnail_url
        ? { imageUrl: body.image_url, thumbnailUrl: body.thumbnail_url }
        : await uploadPlaceholderImage(title, 'events')
    await Promise.all([
      db
        .update(events)
        .set({
          title,
          description: body.description?.trim() || null,
          startDate,
          startTime: allDay ? null : body.start_time?.trim() || null,
          allDay,
          address,
          locationName: body.location_name?.trim() || null,
          sourceUrl: body.source_url?.trim() || null,
          imageUrl: image.imageUrl,
          thumbnailUrl: image.thumbnailUrl,
          updatedAt: new Date(),
        })
        .where(eq(events.id, id)),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'event_updated',
        metadata: { eventId: id },
      }),
    ])

    const row = (await loadEventDetail(id, currentUser.id))!
    return reply.send({
      data: serializeEvent(
        row,
        row.interestStatus as InterestStatus | null,
        row.interestedCount,
        row.interestedPeople,
        currentUser.id,
        row.submittedBy,
      ),
    })
  })

  app.delete('/events/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const currentUser = request.currentUser!

    const [existing] = await db
      .select({ submittedByUserId: events.submittedByUserId })
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Event not found' } })
    }
    if (!canEditEvent(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    await Promise.all([
      db.update(events).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(events.id, id)),
      db.insert(eventsLog).values({ actor: currentUser.id, action: 'event_deleted', metadata: { eventId: id } }),
    ])

    return reply.code(204).send()
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
    // A genuine join + GROUP BY, not a correlated subquery referencing the
    // outer eventSources.id — drizzle only qualifies a raw sql`` column
    // interpolation with its table name when the surrounding query already
    // involves more than one table, so a correlated subquery here silently
    // (and wrongly) resolved the outer id against events' own id column.
    const rows = await db
      .select({
        id: eventSources.id,
        name: eventSources.name,
        url: eventSources.url,
        type: eventSources.type,
        eventCount: sql<number>`count(*) filter (where ${events.status} = 'approved' and ${events.startDate} >= ${todayInChicago()})::int`,
      })
      .from(eventSources)
      .leftJoin(events, and(eq(events.sourceId, eventSources.id), isNull(events.deletedAt)))
      .where(and(eq(eventSources.isActive, true), isNull(eventSources.deletedAt)))
      .groupBy(eventSources.id, eventSources.name, eventSources.url, eventSources.type)
      .orderBy(asc(eventSources.name))

    return reply.send({
      data: rows.map((row) => ({ id: row.id, name: row.name, url: row.url, type: row.type, event_count: row.eventCount })),
      has_more: false,
      next_cursor: null,
    })
  })

  app.get('/event-sources/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    // last_event_added_at/is_stale (below) look at every event ever ingested
    // from this source, all statuses/dates — that's what tells you whether
    // ingestion has gone quiet. The enumerated event list is deliberately
    // narrower: next-upcoming-first, past events excluded, since it's meant
    // to answer "what's coming up from this source," not "what's its history."
    const allSourceConditions = and(eq(events.sourceId, id), isNull(events.deletedAt))
    const upcomingSourceConditions = and(allSourceConditions, gte(events.startDate, todayInChicago()))

    const [[source], sourceEvents, [{ lastEventAddedAt }]] = await Promise.all([
      db
        .select()
        .from(eventSources)
        .where(and(eq(eventSources.id, id), isNull(eventSources.deletedAt)))
        .limit(1),
      db
        .select({ id: events.id, title: events.title, startDate: events.startDate, status: events.status })
        .from(events)
        .where(upcomingSourceConditions)
        .orderBy(asc(events.startDate)),
      // The postgres.js driver returns a raw, untyped `sql` aggregate as a
      // string rather than a Date, unlike drizzle-mapped table columns.
      db.select({ lastEventAddedAt: sql<string | null>`max(${events.createdAt})` }).from(events).where(allSourceConditions),
    ])

    if (!source) {
      return reply.code(404).send({ error: { message: 'Source not found' } })
    }

    // sourceEvents is already upcoming-only (query above), so just check status.
    const eventCount = sourceEvents.filter((e) => e.status === 'approved').length

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
        event_count: eventCount,
        events: sourceEvents.map((e) => ({ id: e.id, title: e.title, start_date: e.startDate, status: e.status })),
      },
    })
  })

  app.get('/events', { preHandler: requireAuth }, async (request, reply) => {
    const query = request.query as { limit?: string; cursor?: string; include_hidden?: string }
    const limit = Math.min(Number(query.limit) || 20, 100)
    const userId = request.currentUser?.id ?? null
    // Feedback #48 — the next-occurrence collapse below hides later dates of
    // a recurring series with no indicator; this flag bypasses the collapse
    // so a client that's already shown the hidden count can ask for
    // everything. Left off (the default), behavior is unchanged from before.
    const includeHidden = query.include_hidden === 'true'

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
    // single-row interestedCountExpr/interestedPeopleExpr used by
    // GET /events/:id above. Substitutes "You" for the current viewer's own
    // name, same as interestedPeopleExpr.
    const interestCounts = db.$with('interest_counts').as(
      db
        .select({
          eventId: eventInterests.eventId,
          interestedCount: sql<number>`count(*) filter (where ${eventInterests.status} = 'interested')::int`.as(
            'interested_count',
          ),
          interestedPeople: sql<InterestedPersonSummary[]>`coalesce(json_agg(json_build_object('name', case when ${eventInterests.userId} = ${userId} then 'You' else ${users.name} end, 'avatar_url', ${users.avatarUrl}) order by ${eventInterests.createdAt}) filter (where ${eventInterests.status} = 'interested'), '[]'::json)`.as(
            'interested_people',
          ),
        })
        .from(eventInterests)
        .innerJoin(users, eq(users.id, eventInterests.userId))
        .where(isNull(eventInterests.deletedAt))
        .groupBy(eventInterests.eventId),
    )

    const cursorCondition =
      cursorStartDate && cursorSortTime && cursorId
        ? sql`(${nextOccurrence.startDate}, ${nextOccurrence.sortTime}, ${nextOccurrence.id}) > (${cursorStartDate}, ${cursorSortTime}::time, ${cursorId})`
        : null
    // includeHidden drops the rn=1 filter entirely (every occurrence, not
    // just the soonest per series); with neither condition present (hidden
    // included, no cursor) we need an explicit `true` since .where() can't
    // take an empty condition.
    const rnCondition = includeHidden ? null : eq(nextOccurrence.rn, 1)
    const whereClause =
      rnCondition && cursorCondition ? and(rnCondition, cursorCondition) : (rnCondition ?? cursorCondition ?? sql`true`)

    const [rows, [hiddenCountRow]] = await Promise.all([
      db
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
          submittedByUserId: nextOccurrence.submittedByUserId,
          interestStatus: eventInterests.status,
          interestedCount: sql<number>`coalesce(${interestCounts.interestedCount}, 0)`,
          interestedPeople: sql<InterestedPersonSummary[]>`coalesce(${interestCounts.interestedPeople}, '[]'::json)`,
          submittedBy: submittedByExpr(nextOccurrence.submittedByUserId),
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
        .where(whereClause)
        .orderBy(asc(nextOccurrence.startDate), asc(nextOccurrence.sortTime), asc(nextOccurrence.id))
        .limit(limit + 1),
      // Total suppressed-occurrence count across the whole upcoming window,
      // not just this page — same nextOccurrence CTE, reused in a second,
      // independent query rather than folded into the paginated one above.
      includeHidden
        ? Promise.resolve([{ count: 0 }])
        : db
            .with(nextOccurrence)
            .select({ count: sql<number>`count(*) filter (where ${nextOccurrence.rn} > 1)::int` })
            .from(nextOccurrence),
    ])

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    const nextCursor =
      hasMore && last ? Buffer.from(`${last.startDate}|${last.sortTime}|${last.id}`).toString('base64url') : null

    return reply.send({
      data: page.map((row) =>
        serializeEvent(
          row,
          row.interestStatus as InterestStatus | null,
          row.interestedCount,
          row.interestedPeople,
          userId,
          row.submittedBy,
        ),
      ),
      has_more: hasMore,
      next_cursor: nextCursor,
      hidden_count: hiddenCountRow?.count ?? 0,
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
