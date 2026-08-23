import { and, asc, eq, getTableColumns, gte, isNull, sql, type SQLWrapper } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { requireAuth, requireRole } from '../auth/plugin.js'
import { db } from '../db/client.js'
import { campComments, campInterests, campSources, camps, eventsLog, schoolBreaks, users } from '../db/schema.js'
import { todayInChicago } from '../dates.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { sortCamps } from './format.js'
import { groupCampsByBreak, type SchoolBreakRow } from './grouping.js'
import { canEditCamp } from './permissions.js'
import { formatCampWhen, locationLabel } from './preview-when.js'

type InterestStatus = 'interested' | 'dismissed'

type InterestedPersonSummary = { name: string; avatar_url: string | null }
type SubmitterSummary = { name: string; avatar_url: string | null }
type SourceSummary = { id: string; name: string }

type SerializableCamp = Pick<
  typeof camps.$inferSelect,
  | 'id'
  | 'title'
  | 'description'
  | 'startDate'
  | 'endDate'
  | 'startTime'
  | 'endTime'
  | 'address'
  | 'locationName'
  | 'latitude'
  | 'longitude'
  | 'distanceMiles'
  | 'pricePerDay'
  | 'priceIsEstimated'
  | 'options'
  | 'optionsNote'
  | 'ageMin'
  | 'ageMax'
  | 'spotsAvailable'
  | 'bookingStatus'
  | 'bookingInstructions'
  | 'prepItems'
  | 'prepNote'
  | 'sourceUrl'
  | 'imageUrl'
  | 'thumbnailUrl'
  | 'submittedByUserId'
>

// The fields loadCampDetail/loadUpcomingCamps hydrate onto every raw camp
// row, ready to serialize as-is rather than threaded through as separate
// positional args at each call site.
type HydratedCamp = SerializableCamp & {
  interestStatus: string | null
  interestedCount: number
  interestedPeople: InterestedPersonSummary[]
  submittedBy: SubmitterSummary | null
  source: SourceSummary | null
}

function serializeCamp(c: HydratedCamp, currentUserId: string | null) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    start_date: c.startDate,
    end_date: c.endDate,
    // Exact hours the camp runs (feedback, 2026-08-05) — null means not
    // confirmed/fixed (e.g. a flexible drop-in pass), shown as "Time: not
    // specified" rather than omitted (see camps/format.ts timeLabel).
    start_time: c.startTime,
    end_time: c.endTime,
    address: c.address,
    location_name: c.locationName,
    latitude: c.latitude,
    longitude: c.longitude,
    distance_miles: c.distanceMiles,
    price_per_day: c.pricePerDay,
    // Only ever true when set directly by a seed script (see
    // camps/seed-2026-08-0X-providers.ts) — never settable through the
    // member self-service POST/PATCH body below, since a member always
    // knows their own listing's real price.
    price_is_estimated: c.priceIsEstimated,
    // Structured tiered/add-on pricing breakdown (e.g. [{label: "Day camp",
    // detail: "8:00 AM – 3:00 PM · $85/day"}, ...]) — shown only on the
    // detail page's "Options" section, never in the compact price_per_day
    // line. Only ever set by a seed script; options_note (below) is the
    // member self-service equivalent instead.
    options: c.options,
    options_note: c.optionsNote,
    age_min: c.ageMin,
    age_max: c.ageMax,
    // Real-time availability isn't tracked — null means unknown, not zero.
    // Only ever set by a seed script today; not on the self-service body.
    spots_available: c.spotsAvailable,
    // 'open' | 'full' | 'waitlist' | 'not_opened' | null (unresearched/
    // unconfirmable) — see schema.ts for the full rationale. Seed-only, same
    // posture as price_is_estimated/options; not on the self-service body.
    booking_status: c.bookingStatus,
    booking_instructions: c.bookingInstructions,
    // Structured "what to bring / prepare" checklist — same shape/posture
    // as options above. prep_note is the member self-service equivalent.
    prep_items: c.prepItems,
    prep_note: c.prepNote,
    source_url: c.sourceUrl,
    image_url: c.imageUrl,
    thumbnail_url: c.thumbnailUrl,
    interest_status: c.interestStatus as InterestStatus | null,
    interested_count: c.interestedCount,
    interested_people: c.interestedPeople,
    // Creator-only edit/delete, same posture as events' self-service posts —
    // no admin override.
    can_edit: currentUserId !== null && canEditCamp({ id: currentUserId }, c),
    submitted_by: c.submittedBy,
    source: c.source,
  }
}

// See events/routes.ts's identically-shaped helpers for the table-qualification
// caveat these correlated scalar subqueries are subject to — every call site
// below already joins/selects from more than one table, so it's safe here too.
function interestedCountExpr(campId: SQLWrapper) {
  return sql<number>`(select count(*)::int from ${campInterests} where ${campInterests.campId} = ${campId} and ${campInterests.status} = 'interested' and ${campInterests.deletedAt} is null)`
}

function interestedPeopleExpr(campId: SQLWrapper, userId: string | null) {
  return sql<InterestedPersonSummary[]>`(select coalesce(json_agg(json_build_object('name', case when ${campInterests.userId} = ${userId} then 'You' else ${users.name} end, 'avatar_url', ${users.avatarUrl}) order by ${campInterests.createdAt}), '[]'::json) from ${campInterests} join ${users} on ${users.id} = ${campInterests.userId} where ${campInterests.campId} = ${campId} and ${campInterests.status} = 'interested' and ${campInterests.deletedAt} is null)`
}

function submittedByExpr(submittedByUserId: SQLWrapper) {
  return sql<SubmitterSummary | null>`(select json_build_object('name', ${users.name}, 'avatar_url', ${users.avatarUrl}) from ${users} where ${users.id} = ${submittedByUserId})`
}

function sourceExpr(sourceId: SQLWrapper) {
  return sql<SourceSummary | null>`(select json_build_object('id', ${campSources.id}, 'name', ${campSources.name}) from ${campSources} where ${campSources.id} = ${sourceId})`
}

const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000
function isSourceStale(lastCampAddedAt: Date | null): boolean {
  return !lastCampAddedAt || Date.now() - lastCampAddedAt.getTime() > STALE_THRESHOLD_MS
}

async function loadCampDetail(id: string, userId: string | null) {
  const [row] = await db
    .select({
      ...getTableColumns(camps),
      interestStatus: campInterests.status,
      interestedCount: interestedCountExpr(camps.id),
      interestedPeople: interestedPeopleExpr(camps.id, userId),
      submittedBy: submittedByExpr(camps.submittedByUserId),
      source: sourceExpr(camps.sourceId),
    })
    .from(camps)
    .leftJoin(
      campInterests,
      userId
        ? and(eq(campInterests.campId, camps.id), eq(campInterests.userId, userId), isNull(campInterests.deletedAt))
        : sql`false`,
    )
    .where(and(eq(camps.id, id), eq(camps.status, 'approved'), isNull(camps.deletedAt)))
    .limit(1)
  return row ?? null
}

// Every approved, non-deleted, still-relevant (end_date >= today) camp, fully
// hydrated — small dataset (a hand-seeded local directory, not an open-ended
// feed), so this is fetched wholesale rather than paginated, same posture as
// GET /event-sources. Backs GET /camps/by-break, the Camps tab's one primary
// fetch (see grouping.ts for why the by-break split itself is computed in TS).
// Deliberately omits the sourceExpr subquery loadCampDetail carries — the
// by-break list view never reads a camp's `source` field (only the detail
// page's cross-listing notes section does), so running it here would be a
// wasted per-row query on every Camps tab load.
async function loadUpcomingCamps(userId: string | null) {
  const rows = await db
    .select({
      ...getTableColumns(camps),
      interestStatus: campInterests.status,
      interestedCount: interestedCountExpr(camps.id),
      interestedPeople: interestedPeopleExpr(camps.id, userId),
      submittedBy: submittedByExpr(camps.submittedByUserId),
    })
    .from(camps)
    .leftJoin(
      campInterests,
      userId
        ? and(eq(campInterests.campId, camps.id), eq(campInterests.userId, userId), isNull(campInterests.deletedAt))
        : sql`false`,
    )
    .where(and(eq(camps.status, 'approved'), isNull(camps.deletedAt), gte(camps.endDate, todayInChicago())))

  // Starred-by-you first, then most-broadly-interested, then booking-open,
  // then alphabetical (see format.ts's sortCamps for the full rule) —
  // replaced the earlier plain-alphabetical order per feedback following
  // #120's reminder email, which applies the identical priority order.
  // groupCampsByBreak's own bucket ordering is chronological and
  // independent of this, but the camps *within* each bucket keep whatever
  // relative order they arrive in here (Array.filter preserves order), so
  // this is what actually determines display order within a break/week
  // section — sorting once here, before bucketing, is equivalent to
  // sorting within each bucket separately, since the sort key doesn't
  // depend on which bucket a camp falls into.
  return sortCamps(rows.map((row) => ({ ...row, viewerInterested: row.interestStatus === 'interested' })))
}

export async function campsRoutes(app: FastifyInstance) {
  // Public, unauthenticated on purpose (feedback #73) — same rationale as
  // events' identical GET /events/:id/preview-meta: a link-preview crawler
  // is never logged in, so it needs a narrow slice of camp data to build a
  // share preview. title/description/image/schedule/location are all
  // already member-visible listing data (see CLAUDE.md's Data safety &
  // classification) — restricted data is never exposed here.
  app.get('/camps/:id/preview-meta', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await db
      .select({
        title: camps.title,
        description: camps.description,
        imageUrl: camps.imageUrl,
        thumbnailUrl: camps.thumbnailUrl,
        startDate: camps.startDate,
        endDate: camps.endDate,
        startTime: camps.startTime,
        endTime: camps.endTime,
        address: camps.address,
        locationName: camps.locationName,
      })
      .from(camps)
      .where(and(eq(camps.id, id), eq(camps.status, 'approved'), isNull(camps.deletedAt)))
      .limit(1)
    if (!row) {
      return reply.code(404).send({ error: { message: 'Camp not found' } })
    }
    return reply.send({
      data: {
        title: row.title,
        description: row.description,
        image_url: row.imageUrl ?? row.thumbnailUrl,
        when: formatCampWhen({ startDate: row.startDate, endDate: row.endDate, startTime: row.startTime, endTime: row.endTime }),
        location: locationLabel({ address: row.address, locationName: row.locationName }),
      },
    })
  })

  app.get('/camps/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.currentUser?.id ?? null

    const row = await loadCampDetail(id, userId)
    if (!row) {
      return reply.code(404).send({ error: { message: 'Camp not found' } })
    }

    return reply.send({ data: serializeCamp(row, userId) })
  })

  // Member self-service camp posting, same posture as events' feedback #46:
  // goes live as 'approved' immediately, no pending step. Only title,
  // address, and start_date are required — end_date defaults to start_date
  // (a single-day camp) when omitted.
  app.post('/camps', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as {
      title?: string
      description?: string
      start_date?: string
      end_date?: string
      start_time?: string
      end_time?: string
      address?: string
      location_name?: string
      price_per_day?: number
      options_note?: string
      age_min?: number
      age_max?: number
      spots_available?: number
      booking_instructions?: string
      prep_note?: string
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
    const endDate = body.end_date?.trim() || startDate
    if (endDate < startDate) {
      return reply.code(400).send({ error: { message: 'end_date must be on or after start_date' } })
    }

    const currentUser = request.currentUser!
    // camps.image_url/thumbnail_url are NOT NULL — a member who doesn't
    // attach a photo still gets a generated placeholder (uploads/placeholder.ts),
    // same as every other insert path.
    const image =
      body.image_url && body.thumbnail_url
        ? { imageUrl: body.image_url, thumbnailUrl: body.thumbnail_url }
        : await uploadPlaceholderImage(title, 'camps')
    const [created] = await db
      .insert(camps)
      .values({
        title,
        description: body.description?.trim() || null,
        startDate,
        endDate,
        startTime: body.start_time?.trim() || null,
        endTime: body.end_time?.trim() || null,
        address,
        locationName: body.location_name?.trim() || null,
        pricePerDay: body.price_per_day != null ? String(body.price_per_day) : null,
        optionsNote: body.options_note?.trim() || null,
        ageMin: body.age_min != null ? Math.trunc(body.age_min) : null,
        ageMax: body.age_max != null ? Math.trunc(body.age_max) : null,
        spotsAvailable: body.spots_available != null ? Math.trunc(body.spots_available) : null,
        bookingInstructions: body.booking_instructions?.trim() || null,
        prepNote: body.prep_note?.trim() || null,
        sourceUrl: body.source_url?.trim() || null,
        imageUrl: image.imageUrl,
        thumbnailUrl: image.thumbnailUrl,
        status: 'approved',
        submittedByUserId: currentUser.id,
      })
      .returning({ id: camps.id })

    await db.insert(eventsLog).values({ actor: currentUser.id, action: 'camp_created', metadata: { campId: created.id } })

    const row = (await loadCampDetail(created.id, currentUser.id))!
    return reply.code(201).send({ data: serializeCamp(row, currentUser.id) })
  })

  app.patch('/camps/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      title?: string
      description?: string
      start_date?: string
      end_date?: string
      start_time?: string
      end_time?: string
      address?: string
      location_name?: string
      price_per_day?: number
      options_note?: string
      age_min?: number
      age_max?: number
      spots_available?: number
      booking_instructions?: string
      prep_note?: string
      source_url?: string
      image_url?: string
      thumbnail_url?: string
    }

    const currentUser = request.currentUser!
    const [existing] = await db
      .select({ submittedByUserId: camps.submittedByUserId })
      .from(camps)
      .where(and(eq(camps.id, id), isNull(camps.deletedAt)))
      .limit(1)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Camp not found' } })
    }
    if (!canEditCamp(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    const title = body.title?.trim()
    const address = body.address?.trim()
    const startDate = body.start_date?.trim()
    if (!title || !address || !startDate) {
      return reply.code(400).send({ error: { message: 'title, address, and start_date are required' } })
    }
    const endDate = body.end_date?.trim() || startDate
    if (endDate < startDate) {
      return reply.code(400).send({ error: { message: 'end_date must be on or after start_date' } })
    }

    // Same NOT NULL fallback as POST /camps above — clearing a photo on edit
    // still leaves a real (generated) image behind, never null.
    const image =
      body.image_url && body.thumbnail_url
        ? { imageUrl: body.image_url, thumbnailUrl: body.thumbnail_url }
        : await uploadPlaceholderImage(title, 'camps')
    await Promise.all([
      db
        .update(camps)
        .set({
          title,
          description: body.description?.trim() || null,
          startDate,
          endDate,
          startTime: body.start_time?.trim() || null,
          endTime: body.end_time?.trim() || null,
          address,
          locationName: body.location_name?.trim() || null,
          pricePerDay: body.price_per_day != null ? String(body.price_per_day) : null,
          optionsNote: body.options_note?.trim() || null,
          ageMin: body.age_min != null ? Math.trunc(body.age_min) : null,
          ageMax: body.age_max != null ? Math.trunc(body.age_max) : null,
          spotsAvailable: body.spots_available != null ? Math.trunc(body.spots_available) : null,
          bookingInstructions: body.booking_instructions?.trim() || null,
          prepNote: body.prep_note?.trim() || null,
          sourceUrl: body.source_url?.trim() || null,
          imageUrl: image.imageUrl,
          thumbnailUrl: image.thumbnailUrl,
          updatedAt: new Date(),
        })
        .where(eq(camps.id, id)),
      db.insert(eventsLog).values({ actor: currentUser.id, action: 'camp_updated', metadata: { campId: id } }),
    ])

    const row = (await loadCampDetail(id, currentUser.id))!
    return reply.send({ data: serializeCamp(row, currentUser.id) })
  })

  app.delete('/camps/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const currentUser = request.currentUser!

    const [existing] = await db
      .select({ submittedByUserId: camps.submittedByUserId })
      .from(camps)
      .where(and(eq(camps.id, id), isNull(camps.deletedAt)))
      .limit(1)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Camp not found' } })
    }
    if (!canEditCamp(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    await Promise.all([
      db.update(camps).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(camps.id, id)),
      db.insert(eventsLog).values({ actor: currentUser.id, action: 'camp_deleted', metadata: { campId: id } }),
    ])

    return reply.code(204).send()
  })

  app.put('/camps/:id/interest', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status?: string }
    if (status !== 'interested' && status !== 'dismissed') {
      return reply.code(400).send({ error: { message: 'status must be "interested" or "dismissed"' } })
    }
    const userId = request.currentUser!.id

    const [camp] = await db
      .select({ id: camps.id })
      .from(camps)
      .where(and(eq(camps.id, id), isNull(camps.deletedAt)))
      .limit(1)
    if (!camp) {
      return reply.code(404).send({ error: { message: 'Camp not found' } })
    }

    await Promise.all([
      db
        .insert(campInterests)
        .values({ userId, campId: id, status })
        .onConflictDoUpdate({
          target: [campInterests.userId, campInterests.campId],
          set: { status, deletedAt: null, updatedAt: new Date() },
        }),
      db.insert(eventsLog).values({
        actor: userId,
        action: status === 'interested' ? 'camp_interested' : 'camp_dismissed',
        metadata: { campId: id },
      }),
    ])

    return reply.code(204).send()
  })

  app.delete('/camps/:id/interest', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.currentUser!.id

    await Promise.all([
      db
        .update(campInterests)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(campInterests.userId, userId), eq(campInterests.campId, id), isNull(campInterests.deletedAt))),
      db.insert(eventsLog).values({ actor: userId, action: 'camp_interest_cleared', metadata: { campId: id } }),
    ])

    return reply.code(204).send()
  })

  app.get('/camps/:id/interested', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const rows = await db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(campInterests)
      .innerJoin(users, eq(users.id, campInterests.userId))
      .where(and(eq(campInterests.campId, id), eq(campInterests.status, 'interested'), isNull(campInterests.deletedAt)))
      .orderBy(asc(campInterests.createdAt))

    return reply.send({ data: rows.map((row) => ({ id: row.id, name: row.name, avatar_url: row.avatarUrl })) })
  })

  // The Camps tab's one primary-view fetch — every upcoming camp, grouped by
  // which school break(s) it overlaps (summer split into weekly buckets). See
  // grouping.ts for why this is computed in TypeScript rather than SQL.
  app.get('/camps/by-break', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.currentUser?.id ?? null
    const today = todayInChicago()

    const [breakRows, campRows] = await Promise.all([
      db
        .select({ id: schoolBreaks.id, name: schoolBreaks.name, startDate: schoolBreaks.startDate, endDate: schoolBreaks.endDate, splitWeekly: schoolBreaks.splitWeekly })
        .from(schoolBreaks)
        .where(isNull(schoolBreaks.deletedAt)),
      loadUpcomingCamps(userId),
    ])

    const breaks: SchoolBreakRow[] = breakRows
    const serializedCamps = campRows.map((row) => ({
      ...serializeCamp({ ...row, source: null }, userId),
      startDate: row.startDate,
      endDate: row.endDate,
    }))

    const groups = groupCampsByBreak(breaks, serializedCamps, today)

    return reply.send({
      data: groups.map((group) => ({
        id: group.bucket.id,
        break_id: group.bucket.breakId,
        name: group.bucket.name,
        label: group.bucket.label,
        start_date: group.bucket.startDate,
        end_date: group.bucket.endDate,
        is_weekly_bucket: group.bucket.isWeeklyBucket,
        camp_count: group.camps.length,
        // Strip the internal-only startDate/endDate duplicate used for
        // overlap matching — the real ones are already in each camp object
        // under start_date/end_date from serializeCamp.
        camps: group.camps.map(({ startDate: _startDate, endDate: _endDate, ...camp }) => camp),
      })),
    })
  })

  // Cross-listing notes (feedback #50): comments left on OTHER camps that
  // share this camp's source, so e.g. viewing one YMCA camp surfaces notes
  // people left about other YMCA camps too. A self-submitted camp has no
  // source, so it always returns empty rather than querying. Returns each
  // note's origin camp's start_date/end_date rather than its title
  // (feedback, 2026-08-05: "specify which date it came from") — camp_title
  // was always identical to the current page's own title (titles are just
  // the provider name — see Camps data model & sourcing in CLAUDE.md), so
  // it never actually distinguished one occurrence from another; the date
  // does. The frontend merges these into the same list as this camp's own
  // comments (CommentsSection.tsx) rather than a visually separate section.
  app.get('/camps/:id/source-notes', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [camp] = await db
      .select({ sourceId: camps.sourceId })
      .from(camps)
      .where(and(eq(camps.id, id), isNull(camps.deletedAt)))
      .limit(1)
    if (!camp) {
      return reply.code(404).send({ error: { message: 'Camp not found' } })
    }
    if (!camp.sourceId) {
      return reply.send({ data: [], has_more: false, next_cursor: null })
    }

    const rows = await db
      .select({
        id: campComments.id,
        body: campComments.body,
        createdAt: campComments.createdAt,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
        campId: camps.id,
        campStartDate: camps.startDate,
        campEndDate: camps.endDate,
      })
      .from(campComments)
      .innerJoin(camps, eq(camps.id, campComments.campId))
      .innerJoin(users, eq(users.id, campComments.userId))
      .where(
        and(
          eq(camps.sourceId, camp.sourceId),
          sql`${camps.id} != ${id}`,
          isNull(camps.deletedAt),
          isNull(campComments.deletedAt),
        ),
      )
      .orderBy(sql`${campComments.createdAt} desc`)

    return reply.send({
      data: rows.map((row) => ({
        id: row.id,
        body: row.body,
        created_at: row.createdAt,
        author_name: row.authorName,
        author_avatar_url: row.authorAvatarUrl,
        camp_id: row.campId,
        camp_start_date: row.campStartDate,
        camp_end_date: row.campEndDate,
      })),
      has_more: false,
      next_cursor: null,
    })
  })

  app.get('/camp-sources', { preHandler: requireAuth }, async (_request, reply) => {
    const rows = await db
      .select({
        id: campSources.id,
        name: campSources.name,
        url: campSources.url,
        type: campSources.type,
        campCount: sql<number>`count(*) filter (where ${camps.status} = 'approved' and ${camps.endDate} >= ${todayInChicago()})::int`,
      })
      .from(campSources)
      .leftJoin(camps, and(eq(camps.sourceId, campSources.id), isNull(camps.deletedAt)))
      .where(and(eq(campSources.isActive, true), isNull(campSources.deletedAt)))
      .groupBy(campSources.id, campSources.name, campSources.url, campSources.type)
      .orderBy(asc(campSources.name))

    return reply.send({
      data: rows.map((row) => ({ id: row.id, name: row.name, url: row.url, type: row.type, camp_count: row.campCount })),
      has_more: false,
      next_cursor: null,
    })
  })

  // Same treatment as events/routes.ts's POST /event-sources (feedback
  // #102 follow-up, "be sure the camps page gets the same treatment,
  // particularly sources should be moved"): admin-only, since a junk source
  // shouldn't silently show up in the hand-researched provider list. Unlike
  // events, camp sources have only ever had one real `type` value in
  // practice ("provider_website" — see CLAUDE.md's Camps section: hand-
  // researched providers, not a scraping pipeline with several source
  // shapes) — so it's hardcoded here rather than a client-supplied field.
  app.post('/camp-sources', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as { name?: string; url?: string; notes?: string }
    const name = body.name?.trim()
    const url = body.url?.trim()
    if (!name || !url) {
      return reply.code(400).send({ error: { message: 'name and url are required' } })
    }

    const currentUser = request.currentUser!
    const [created] = await db
      .insert(campSources)
      .values({ name, url, type: 'provider_website', notes: body.notes?.trim() || null, isActive: true })
      .returning({ id: campSources.id })

    await db.insert(eventsLog).values({
      actor: currentUser.id,
      action: 'camp_source_created',
      metadata: { sourceId: created.id },
    })

    return reply.code(201).send({ data: { id: created.id, name, url, type: 'provider_website', camp_count: 0 } })
  })

  app.get('/camp-sources/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const allSourceConditions = and(eq(camps.sourceId, id), isNull(camps.deletedAt))
    const upcomingSourceConditions = and(allSourceConditions, gte(camps.endDate, todayInChicago()))

    const [[source], sourceCamps, [{ lastCampAddedAt }]] = await Promise.all([
      db
        .select()
        .from(campSources)
        .where(and(eq(campSources.id, id), isNull(campSources.deletedAt)))
        .limit(1),
      db
        .select({ id: camps.id, title: camps.title, startDate: camps.startDate, endDate: camps.endDate, status: camps.status })
        .from(camps)
        .where(upcomingSourceConditions)
        .orderBy(asc(camps.startDate)),
      db.select({ lastCampAddedAt: sql<string | null>`max(${camps.createdAt})` }).from(camps).where(allSourceConditions),
    ])

    if (!source) {
      return reply.code(404).send({ error: { message: 'Source not found' } })
    }

    const campCount = sourceCamps.filter((c) => c.status === 'approved').length

    return reply.send({
      data: {
        id: source.id,
        name: source.name,
        url: source.url,
        type: source.type,
        notes: source.notes,
        is_active: source.isActive,
        last_checked_at: source.lastCheckedAt,
        last_camp_added_at: lastCampAddedAt,
        is_stale: isSourceStale(lastCampAddedAt ? new Date(lastCampAddedAt) : null),
        camp_count: campCount,
        camps: sourceCamps.map((c) => ({ id: c.id, title: c.title, start_date: c.startDate, end_date: c.endDate, status: c.status })),
      },
    })
  })
}
