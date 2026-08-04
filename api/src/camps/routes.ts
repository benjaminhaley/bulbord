import { and, asc, eq, getTableColumns, gte, isNull, sql, type SQLWrapper } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { db } from '../db/client.js'
import { campComments, campInterests, campSources, camps, eventsLog, schoolBreaks, users } from '../db/schema.js'
import { todayInChicago } from '../dates.js'
import { groupCampsByBreak, type SchoolBreakRow } from './grouping.js'
import { canEditCamp } from './permissions.js'

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
  | 'address'
  | 'locationName'
  | 'latitude'
  | 'longitude'
  | 'distanceMiles'
  | 'pricePerDay'
  | 'priceIsEstimated'
  | 'ageMin'
  | 'ageMax'
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
    age_min: c.ageMin,
    age_max: c.ageMax,
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
  return db
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
    .orderBy(asc(camps.startDate))
}

export async function campsRoutes(app: FastifyInstance) {
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
      address?: string
      location_name?: string
      price_per_day?: number
      age_min?: number
      age_max?: number
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
    const [created] = await db
      .insert(camps)
      .values({
        title,
        description: body.description?.trim() || null,
        startDate,
        endDate,
        address,
        locationName: body.location_name?.trim() || null,
        pricePerDay: body.price_per_day != null ? String(body.price_per_day) : null,
        ageMin: body.age_min != null ? Math.trunc(body.age_min) : null,
        ageMax: body.age_max != null ? Math.trunc(body.age_max) : null,
        sourceUrl: body.source_url?.trim() || null,
        imageUrl: body.image_url || null,
        thumbnailUrl: body.thumbnail_url || null,
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
      address?: string
      location_name?: string
      price_per_day?: number
      age_min?: number
      age_max?: number
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

    await Promise.all([
      db
        .update(camps)
        .set({
          title,
          description: body.description?.trim() || null,
          startDate,
          endDate,
          address,
          locationName: body.location_name?.trim() || null,
          pricePerDay: body.price_per_day != null ? String(body.price_per_day) : null,
          ageMin: body.age_min != null ? Math.trunc(body.age_min) : null,
          ageMax: body.age_max != null ? Math.trunc(body.age_max) : null,
          sourceUrl: body.source_url?.trim() || null,
          imageUrl: body.image_url || null,
          thumbnailUrl: body.thumbnail_url || null,
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
  // source, so it always returns empty rather than querying.
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
        campTitle: camps.title,
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
        camp_title: row.campTitle,
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
