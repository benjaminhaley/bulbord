import { and, asc, eq, getTableColumns, gte, isNull, lte, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { requireAuth, requireRole } from '../auth/plugin.js'
import { db } from '../db/client.js'
import { events, eventSources, eventInterests, eventsLog, users } from '../db/schema.js'
import { addDays, todayInChicago } from '../dates.js'
// Reused rather than duplicated for the preview-meta route below (feedback
// #73 follow-up) — these are the existing, already-tested formatters, just
// living in newsletter/ for historical reasons (their byte-identical-parity
// requirement is with web/src/events/format.ts, not with anything
// newsletter-specific — see that file's own header).
import { formatWhen, locationLabel } from '../newsletter/format.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { buildEventFilterConditions, parseAfterTimeParam, parseBeforeTimeParam, parseTopicsParam } from './filters.js'
import { getEventsForWeek } from './week-query.js'
import { canEditEvent } from './permissions.js'
import { extractEventFieldsFromDescription, findEventDetailsFromDescription } from './description-extraction.js'
import { enrichEventImage } from './image-enrichment.js'
import { extractEventFieldsFromPhoto, findEventSource, type ExtractedEventFields } from './photo-extraction.js'
import { registerDiscoveredEventSource } from './source-registration.js'
import {
  interestedCountExpr,
  interestedPeopleExpr,
  serializeEvent,
  submittedByExpr,
  type InterestedPersonSummary,
  type InterestStatus,
} from './serialize.js'

// Matches eventSources.type's own comment in db/schema.ts — kept here rather
// than a DB enum since new source shapes get added over time (see CLAUDE.md's
// event_sources bullet).
const EVENT_SOURCE_TYPES = ['generic_search', 'website', 'facebook_group', 'open_data']

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
        endTime: events.endTime,
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
        when: formatWhen({ startDate: row.startDate, startTime: row.startTime, endTime: row.endTime, allDay: row.allDay }),
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

  // Photo-to-listing extraction (feedback #93), stage 1 of 2 (feedback,
  // 2026-08-23: "a very fast stage where you just get as much information
  // from the image as possible") — a member uploads a photo of a poster/
  // flyer (already run through the normal POST /uploads flow) and this
  // reads a candidate event out of it, vision only, no web search. The
  // frontend pre-fills and shows the same EventForm a manual post uses
  // (image_url/thumbnail_url included, so the flyer photo itself becomes
  // the event's real photo) the instant this resolves — deliberately just
  // extraction, not creation, so the member reviews/edits before ever
  // tapping Post. Stage 2 (POST /events/find-event-source, below) is a
  // separate, slower call the frontend makes afterward, in parallel with
  // the member already looking at this stage's result.
  app.post('/events/extract-from-photo', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { image_url?: string }
    const imageUrl = body.image_url?.trim()
    if (!imageUrl) {
      return reply.code(400).send({ error: { message: 'image_url is required' } })
    }
    const extracted = await extractEventFieldsFromPhoto(imageUrl)
    return reply.send({ data: extracted })
  })

  // Photo-to-listing extraction, stage 2 of 2 — the slower live web search
  // for the event's real hosting organization, only worth calling when
  // stage 1 didn't already find a URL printed on the poster. Takes the
  // subset of stage 1's fields the search actually needs, not an event id —
  // this can resolve either before or after the member has already tapped
  // Post (see AddEventModal.tsx), so it's deliberately stateless here; the
  // frontend decides whether to apply the result to the still-open form or
  // to PATCH an already-created event.
  app.post('/events/find-event-source', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { title?: string; location_name?: string; address?: string }
    const title = body.title?.trim()
    if (!title) {
      return reply.code(400).send({ error: { message: 'title is required' } })
    }
    const found = await findEventSource({ title, location_name: body.location_name, address: body.address })
    return reply.send({ data: found ? { source_url: found.url, source_name: found.sourceName, address: found.address } : null })
  })

  // Description-to-listing extraction (feedback #133), stage 1 of 2 — the
  // same review-before-post shape as the photo flow above, this time
  // starting from a member-typed sentence instead of a photo. A fast,
  // non-search text call: reads whatever the description already states
  // outright. Unlike the photo flow, a start_date isn't required for this
  // to count as "found" — a typed description often can't pin one down on
  // its own, and stage 2 below (always run for this flow, not conditional)
  // is what's actually responsible for finding it via search.
  app.post('/events/extract-from-description', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { description?: string }
    const description = body.description?.trim()
    if (!description) {
      return reply.code(400).send({ error: { message: 'description is required' } })
    }
    const extracted = await extractEventFieldsFromDescription(description)
    return reply.send({ data: extracted })
  })

  // Description-to-listing extraction, stage 2 of 2 — a live web search for
  // the real event being described, filling in whatever stage 1 couldn't
  // determine (which, for a sparse description, can be nearly everything:
  // real date/time/address, not just a source URL). Stateless here for the
  // same reason as find-event-source above — the frontend decides whether
  // to apply the result to the still-open form or patch an already-created
  // event.
  app.post('/events/find-event-details-from-description', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { description?: string; fields?: Partial<ExtractedEventFields> }
    const description = body.description?.trim()
    if (!description) {
      return reply.code(400).send({ error: { message: 'description is required' } })
    }
    const found = await findEventDetailsFromDescription(description, body.fields ?? {})
    return reply.send({ data: found })
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
      end_time?: string
      all_day?: boolean
      address?: string
      location_name?: string
      source_url?: string
      // Only ever sent by the photo-extraction flow (AddFromPhotoButton.tsx)
      // — its presence is what signals "also register source_url as a
      // crawlable source", not a general-purpose field a member fills in
      // themselves. See source-registration.ts.
      source_name?: string
      image_url?: string
      thumbnail_url?: string
      topic?: string
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
        endTime: allDay ? null : body.end_time?.trim() || null,
        allDay,
        address,
        locationName: body.location_name?.trim() || null,
        sourceUrl: body.source_url?.trim() || null,
        imageUrl: image.imageUrl,
        thumbnailUrl: image.thumbnailUrl,
        topic: body.topic?.trim() || null,
        status: 'approved',
        submittedByUserId: currentUser.id,
      })
      .returning({ id: events.id })

    await db.insert(eventsLog).values({
      actor: currentUser.id,
      action: 'event_created',
      metadata: { eventId: created.id },
    })

    // Member self-service posting had no automated image-sourcing of its
    // own — a member who doesn't attach a photo (both the manual-entry and
    // describe-it paths allow this) used to just get the generated
    // placeholder and nothing more, unlike a sourced/scraped event, which
    // always gets a real search first (see image-enrichment.ts's own header
    // and CLAUDE.md's "never settle for a placeholder without exhausting
    // real search first" rule). Reusing the exact same enrichEventImage()
    // a sourced event's ingestion already calls closes that gap here too —
    // fire-and-forget (not awaited into the response), same posture as the
    // registerDiscoveredEventSource call just below, so posting still feels
    // instant; the real photo (if one is found) shows up the next time the
    // event is fetched, same as every other background enrichment in this
    // codebase.
    if (!(body.image_url && body.thumbnail_url)) {
      void enrichEventImage(created.id, {
        sourceUrl: body.source_url?.trim() || null,
        title,
        description: body.description?.trim() || null,
      }).catch(() => {})
    }

    // Best-effort, non-blocking: a failure here must never undo or fail the
    // event creation that already succeeded above.
    const sourceUrl = body.source_url?.trim()
    const sourceName = body.source_name?.trim()
    if (sourceUrl && sourceName) {
      try {
        const sourceId = await registerDiscoveredEventSource(sourceUrl, sourceName, currentUser.id)
        // Links the event to the source via the real FK, not just the
        // free-text source_url field — without this, the source row exists
        // but nothing (the admin sources list's own event_count, a future
        // resourcing.ts join) can see the connection (feedback, 2026-08-23:
        // "I don't see the root source... being added to event sources").
        await db.update(events).set({ sourceId }).where(eq(events.id, created.id))
      } catch {
        // ignore — see comment above
      }
    }

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
      end_time?: string
      all_day?: boolean
      address?: string
      location_name?: string
      source_url?: string
      // Only ever sent by the photo-extraction flow's background stage-2
      // continuation (AddEventModal.tsx) when it resolves after the member
      // has already posted — see source-registration.ts and this route's
      // own call to it below.
      source_name?: string
      image_url?: string
      thumbnail_url?: string
      topic?: string
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
          endTime: allDay ? null : body.end_time?.trim() || null,
          allDay,
          address,
          locationName: body.location_name?.trim() || null,
          sourceUrl: body.source_url?.trim() || null,
          imageUrl: image.imageUrl,
          thumbnailUrl: image.thumbnailUrl,
          topic: body.topic?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(events.id, id)),
      db.insert(eventsLog).values({
        actor: currentUser.id,
        action: 'event_updated',
        metadata: { eventId: id },
      }),
    ])

    // Same fire-and-forget image search as POST /events above — clearing a
    // photo on edit shouldn't leave the event permanently stuck on a
    // placeholder any more than never having one in the first place should.
    if (!(body.image_url && body.thumbnail_url)) {
      void enrichEventImage(id, {
        sourceUrl: body.source_url?.trim() || null,
        title,
        description: body.description?.trim() || null,
      }).catch(() => {})
    }

    // Best-effort, non-blocking — same as POST /events above.
    const sourceUrl = body.source_url?.trim()
    const sourceName = body.source_name?.trim()
    if (sourceUrl && sourceName) {
      try {
        const sourceId = await registerDiscoveredEventSource(sourceUrl, sourceName, currentUser.id)
        await db.update(events).set({ sourceId }).where(eq(events.id, id))
      } catch {
        // ignore — see comment above
      }
    }

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

  // Feedback (2026-08-17, "consolidate these icons"): sources used to be
  // added only by hand-run seed/backfill scripts (see CLAUDE.md's Camps
  // section on hand-researched provider data, and Events data model &
  // sourcing's "reviewed live with Ben" seed batches) — this is the first
  // real UI path to create one. Kept admin-only (unlike self-service event
  // posting, feedback #46): a bad/junk source would otherwise silently feed
  // the Claude-driven "re-run event sourcing" tool, so Ben stays the one
  // curating what gets sourced from, same posture as the rest of this
  // codebase's source-vetting checklist.
  app.post('/event-sources', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as { name?: string; url?: string; type?: string; notes?: string }
    const name = body.name?.trim()
    const url = body.url?.trim()
    const type = body.type?.trim()
    if (!name || !url || !type) {
      return reply.code(400).send({ error: { message: 'name, url, and type are required' } })
    }
    if (!EVENT_SOURCE_TYPES.includes(type)) {
      return reply.code(400).send({ error: { message: `type must be one of: ${EVENT_SOURCE_TYPES.join(', ')}` } })
    }

    const currentUser = request.currentUser!
    const [created] = await db
      .insert(eventSources)
      .values({ name, url, type, notes: body.notes?.trim() || null, isActive: true })
      .returning({ id: eventSources.id })

    await db.insert(eventsLog).values({
      actor: currentUser.id,
      action: 'event_source_created',
      metadata: { sourceId: created.id },
    })

    return reply.code(201).send({ data: { id: created.id, name, url, type, event_count: 0 } })
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
    const query = request.query as {
      limit?: string
      cursor?: string
      include_hidden?: string
      topics?: string
      before_time?: string
      after_time?: string
    }
    const limit = Math.min(Number(query.limit) || 20, 100)
    const userId = request.currentUser?.id ?? null
    // Feedback #48 — the next-occurrence collapse below hides later dates of
    // a recurring series with no indicator; this flag bypasses the collapse
    // so a client that's already shown the hidden count can ask for
    // everything. Left off (the default), behavior is unchanged from before.
    const includeHidden = query.include_hidden === 'true'
    // Feedback #97 — topic (Movie Night, Sports & Fitness, ...) and an
    // hours-of-day range ("only show events starting between HH:MM and HH:MM").
    const topics = parseTopicsParam(query.topics)
    const beforeTime = parseBeforeTimeParam(query.before_time)
    const afterTime = parseAfterTimeParam(query.after_time)

    let cursorStartDate: string | null = null
    let cursorSortTime: string | null = null
    let cursorId: string | null = null
    if (query.cursor) {
      const [startDate, sortTime, id] = Buffer.from(query.cursor, 'base64url').toString('utf8').split('|')
      cursorStartDate = startDate ?? null
      cursorSortTime = sortTime ?? null
      cursorId = id ?? null
    }

    const today = todayInChicago()
    // Feedback #111 (2026-08-19): a recurring series' later occurrences used
    // to always hide behind "Show N hidden repeating events," even one
    // starting just as soon as the series' own next occurrence — a member
    // saw only one of two block parties happening the same weekend until
    // they tapped reveal. Any occurrence within the next 7 days now shows
    // by default alongside the series' soonest one; only occurrences
    // further out than that AND not the soonest stay behind the reveal.
    const sevenDaysOut = addDays(today, 7)

    const conditions = [
      eq(events.status, 'approved'),
      isNull(events.deletedAt),
      gte(events.startDate, today),
      ...buildEventFilterConditions(topics, beforeTime, afterTime),
    ]

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
    // includeHidden drops the rn=1-or-within-7-days filter entirely (every
    // occurrence, not just the visible-by-default ones); with neither
    // condition present (hidden included, no cursor) we need an explicit
    // `true` since .where() can't take an empty condition.
    const rnCondition = includeHidden ? null : or(eq(nextOccurrence.rn, 1), lte(nextOccurrence.startDate, sevenDaysOut))
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
          endTime: nextOccurrence.endTime,
          allDay: nextOccurrence.allDay,
          address: nextOccurrence.address,
          locationName: nextOccurrence.locationName,
          latitude: nextOccurrence.latitude,
          longitude: nextOccurrence.longitude,
          sourceUrl: nextOccurrence.sourceUrl,
          imageUrl: nextOccurrence.imageUrl,
          thumbnailUrl: nextOccurrence.thumbnailUrl,
          submittedByUserId: nextOccurrence.submittedByUserId,
          topic: nextOccurrence.topic,
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
      // Matches rnCondition's own visibility rule: an occurrence only stays
      // hidden if it's neither the series' soonest nor within 7 days.
      includeHidden
        ? Promise.resolve([{ count: 0 }])
        : db
            .with(nextOccurrence)
            .select({
              count: sql<number>`count(*) filter (where ${nextOccurrence.rn} > 1 and ${nextOccurrence.startDate} > ${sevenDaysOut})::int`,
            })
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

  // Calendar week view (feedback #97) — every real occurrence within a
  // Sunday-Saturday week, not the next-occurrence-collapsed set the main
  // list above shows; see week-query.ts's own header for why this is a
  // deliberate parallel query rather than a variant of the CTE above.
  app.get('/events/week', { preHandler: requireAuth }, async (request, reply) => {
    const query = request.query as { start?: string; topics?: string; before_time?: string; after_time?: string }
    const weekStart = query.start
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return reply.code(400).send({ error: { message: 'start (YYYY-MM-DD) is required' } })
    }
    const userId = request.currentUser?.id ?? null
    const topics = parseTopicsParam(query.topics)
    const beforeTime = parseBeforeTimeParam(query.before_time)
    const afterTime = parseAfterTimeParam(query.after_time)

    const weekEvents = await getEventsForWeek(weekStart, topics, beforeTime, afterTime, userId)
    return reply.send({ data: weekEvents })
  })
}
