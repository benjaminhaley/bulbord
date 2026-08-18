import { and, asc, eq, getTableColumns, isNull, sql, type SQLWrapper } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { requireAuth, requireRole } from '../auth/plugin.js'
import { db } from '../db/client.js'
import { eventsLog, sportsClubComments, sportsClubInterests, sportsClubOccurrences, sportsClubs, sportsClubSources, users } from '../db/schema.js'
import { todayInChicago } from '../dates.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { canEditSportsClub } from './permissions.js'
import { sortSportsClubs, type SportsClubSortInput } from './sorting.js'

type InterestStatus = 'interested' | 'dismissed'

type InterestedPersonSummary = { name: string; avatar_url: string | null }
type SubmitterSummary = { name: string; avatar_url: string | null }
type SourceSummary = { id: string; name: string }
type OccurrenceSummary = { date: string; start_time: string | null; end_time: string | null; note: string | null }

type SerializableSportsClub = Pick<
  typeof sportsClubs.$inferSelect,
  | 'id'
  | 'title'
  | 'description'
  | 'category'
  | 'scheduleType'
  | 'firstDate'
  | 'lastDate'
  | 'cadenceNote'
  | 'ageMin'
  | 'ageMax'
  | 'price'
  | 'priceUnit'
  | 'pricePerWeek'
  | 'priceNote'
  | 'options'
  | 'address'
  | 'locationName'
  | 'latitude'
  | 'longitude'
  | 'distanceMiles'
  | 'signupStatus'
  | 'signupInstructions'
  | 'sourceUrl'
  | 'imageUrl'
  | 'thumbnailUrl'
  | 'submittedByUserId'
>

type HydratedSportsClub = SerializableSportsClub & {
  interestStatus: string | null
  interestedCount: number
  interestedPeople: InterestedPersonSummary[]
  submittedBy: SubmitterSummary | null
  source: SourceSummary | null
  nextOccurrenceDate: string | null
  occurrences: OccurrenceSummary[]
}

function serializeSportsClub(c: HydratedSportsClub, currentUserId: string | null) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    schedule_type: c.scheduleType,
    first_date: c.firstDate,
    last_date: c.lastDate,
    cadence_note: c.cadenceNote,
    age_min: c.ageMin,
    age_max: c.ageMax,
    price: c.price,
    price_unit: c.priceUnit,
    // Hand-computed standardized weekly-equivalent (see db/schema.ts) —
    // always shown as an approximation, never as if it were itself the
    // real published rate; price/price_unit above stay the real source.
    price_per_week: c.pricePerWeek,
    price_note: c.priceNote,
    // Structured tier breakdown, shown only for a listing with real,
    // distinct bookable options — see db/schema.ts's SportsClubOptionLine.
    // Only ever set by a seed script, same posture as camps.options.
    options: c.options,
    address: c.address,
    location_name: c.locationName,
    latitude: c.latitude,
    longitude: c.longitude,
    distance_miles: c.distanceMiles,
    signup_status: c.signupStatus,
    signup_instructions: c.signupInstructions,
    source_url: c.sourceUrl,
    image_url: c.imageUrl,
    thumbnail_url: c.thumbnailUrl,
    interest_status: c.interestStatus as InterestStatus | null,
    interested_count: c.interestedCount,
    interested_people: c.interestedPeople,
    can_edit: currentUserId !== null && canEditSportsClub({ id: currentUserId }, c),
    submitted_by: c.submittedBy,
    source: c.source,
    next_occurrence_date: c.nextOccurrenceDate,
    occurrences: c.occurrences,
  }
}

// See camps/routes.ts's identically-shaped helpers for the table-qualification
// caveat these correlated scalar subqueries are subject to — every call site
// below already joins/selects from more than one table, so it's safe here too.
function interestedCountExpr(sportsClubId: SQLWrapper) {
  return sql<number>`(select count(*)::int from ${sportsClubInterests} where ${sportsClubInterests.sportsClubId} = ${sportsClubId} and ${sportsClubInterests.status} = 'interested' and ${sportsClubInterests.deletedAt} is null)`
}

function interestedPeopleExpr(sportsClubId: SQLWrapper, userId: string | null) {
  return sql<InterestedPersonSummary[]>`(select coalesce(json_agg(json_build_object('name', case when ${sportsClubInterests.userId} = ${userId} then 'You' else ${users.name} end, 'avatar_url', ${users.avatarUrl}) order by ${sportsClubInterests.createdAt}), '[]'::json) from ${sportsClubInterests} join ${users} on ${users.id} = ${sportsClubInterests.userId} where ${sportsClubInterests.sportsClubId} = ${sportsClubId} and ${sportsClubInterests.status} = 'interested' and ${sportsClubInterests.deletedAt} is null)`
}

function submittedByExpr(submittedByUserId: SQLWrapper) {
  return sql<SubmitterSummary | null>`(select json_build_object('name', ${users.name}, 'avatar_url', ${users.avatarUrl}) from ${users} where ${users.id} = ${submittedByUserId})`
}

function sourceExpr(sourceId: SQLWrapper) {
  return sql<SourceSummary | null>`(select json_build_object('id', ${sportsClubSources.id}, 'name', ${sportsClubSources.name}) from ${sportsClubSources} where ${sportsClubSources.id} = ${sourceId})`
}

// Earliest not-yet-passed occurrence for a listing — drives both sorting.ts's
// effectiveSortDate (for an 'ongoing' listing) and its relevance check.
function nextOccurrenceDateExpr(sportsClubId: SQLWrapper, today: string) {
  return sql<string | null>`(select min(${sportsClubOccurrences.date}) from ${sportsClubOccurrences} where ${sportsClubOccurrences.sportsClubId} = ${sportsClubId} and ${sportsClubOccurrences.date} >= ${today} and ${sportsClubOccurrences.deletedAt} is null)`
}

// Upcoming occurrences for a listing, soonest first — `limit` truncates for
// the flat-list view (a short preview), omitted entirely for the detail page
// (the full known schedule). LIMIT has to happen inside the subquery, before
// json_agg, since json_agg itself has no LIMIT of its own.
function occurrencesExpr(sportsClubId: SQLWrapper, today: string, limit: number | null) {
  const limitClause = limit !== null ? sql`limit ${limit}` : sql``
  return sql<OccurrenceSummary[]>`(select coalesce(json_agg(row_to_json(o)), '[]'::json) from (select ${sportsClubOccurrences.date} as date, ${sportsClubOccurrences.startTime} as start_time, ${sportsClubOccurrences.endTime} as end_time, ${sportsClubOccurrences.note} as note from ${sportsClubOccurrences} where ${sportsClubOccurrences.sportsClubId} = ${sportsClubId} and ${sportsClubOccurrences.date} >= ${today} and ${sportsClubOccurrences.deletedAt} is null order by ${sportsClubOccurrences.date} asc ${limitClause}) o)`
}

const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000
function isSourceStale(lastAddedAt: Date | null): boolean {
  return !lastAddedAt || Date.now() - lastAddedAt.getTime() > STALE_THRESHOLD_MS
}

async function loadSportsClubDetail(id: string, userId: string | null) {
  const today = todayInChicago()
  const [row] = await db
    .select({
      ...getTableColumns(sportsClubs),
      interestStatus: sportsClubInterests.status,
      interestedCount: interestedCountExpr(sportsClubs.id),
      interestedPeople: interestedPeopleExpr(sportsClubs.id, userId),
      submittedBy: submittedByExpr(sportsClubs.submittedByUserId),
      source: sourceExpr(sportsClubs.sourceId),
      nextOccurrenceDate: nextOccurrenceDateExpr(sportsClubs.id, today),
      occurrences: occurrencesExpr(sportsClubs.id, today, null),
    })
    .from(sportsClubs)
    .leftJoin(
      sportsClubInterests,
      userId
        ? and(eq(sportsClubInterests.sportsClubId, sportsClubs.id), eq(sportsClubInterests.userId, userId), isNull(sportsClubInterests.deletedAt))
        : sql`false`,
    )
    .where(and(eq(sportsClubs.id, id), eq(sportsClubs.status, 'approved'), isNull(sportsClubs.deletedAt)))
    .limit(1)
  return row ?? null
}

// The number of upcoming occurrences shown in the flat-list preview before a
// member taps through to the detail page for the full schedule.
const LIST_OCCURRENCE_PREVIEW_LIMIT = 3

// Every approved, non-deleted sports club, fully hydrated — small dataset
// (a hand-researched directory, not an open-ended feed), fetched wholesale
// and then sorted/filtered in TS by sorting.ts, same "no pagination
// pressure" posture as camps/grouping.ts. Deliberately omits the sourceExpr
// subquery loadSportsClubDetail carries, same reasoning as camps'
// loadUpcomingCamps — the flat list never reads a listing's `source` field.
async function loadAllSportsClubs(userId: string | null) {
  const today = todayInChicago()
  return db
    .select({
      ...getTableColumns(sportsClubs),
      interestStatus: sportsClubInterests.status,
      interestedCount: interestedCountExpr(sportsClubs.id),
      interestedPeople: interestedPeopleExpr(sportsClubs.id, userId),
      submittedBy: submittedByExpr(sportsClubs.submittedByUserId),
      nextOccurrenceDate: nextOccurrenceDateExpr(sportsClubs.id, today),
      occurrences: occurrencesExpr(sportsClubs.id, today, LIST_OCCURRENCE_PREVIEW_LIMIT),
    })
    .from(sportsClubs)
    .leftJoin(
      sportsClubInterests,
      userId
        ? and(eq(sportsClubInterests.sportsClubId, sportsClubs.id), eq(sportsClubInterests.userId, userId), isNull(sportsClubInterests.deletedAt))
        : sql`false`,
    )
    .where(and(eq(sportsClubs.status, 'approved'), isNull(sportsClubs.deletedAt)))
}

interface SportsClubBody {
  title?: string
  description?: string
  category?: string
  schedule_type?: string
  first_date?: string
  last_date?: string
  cadence_note?: string
  age_min?: number
  age_max?: number
  price?: number
  price_unit?: string
  price_note?: string
  address?: string
  location_name?: string
  signup_instructions?: string
  source_url?: string
  image_url?: string
  thumbnail_url?: string
}

// Only title/category/address are required (member self-service, same
// "minimal required fields" posture as events'/camps' own POST routes) —
// everything else, including every date field, is optional. No occurrence
// editor: a member-submitted listing never gets sports_club_occurrences rows
// (see CLAUDE.md's "self-service stays simple" precedent for camps' options/
// prep_items) — sorting.ts's relevance rule is deliberately NOT gated on
// having any, specifically so a member's listing still shows up.
function validateSportsClubBody(body: SportsClubBody): { title: string; category: string; address: string } | null {
  const title = body.title?.trim()
  const category = body.category?.trim()
  const address = body.address?.trim()
  if (!title || !category || !address) return null
  return { title, category, address }
}

function sportsClubWriteValues(body: SportsClubBody, image: { imageUrl: string; thumbnailUrl: string }) {
  return {
    description: body.description?.trim() || null,
    scheduleType: body.schedule_type === 'ongoing' ? 'ongoing' : 'fixed_session',
    firstDate: body.first_date?.trim() || null,
    lastDate: body.last_date?.trim() || null,
    cadenceNote: body.cadence_note?.trim() || null,
    ageMin: body.age_min != null ? Math.trunc(body.age_min) : null,
    ageMax: body.age_max != null ? Math.trunc(body.age_max) : null,
    price: body.price != null ? String(body.price) : null,
    priceUnit: body.price_unit?.trim() || null,
    priceNote: body.price_note?.trim() || null,
    locationName: body.location_name?.trim() || null,
    signupInstructions: body.signup_instructions?.trim() || null,
    sourceUrl: body.source_url?.trim() || null,
    imageUrl: image.imageUrl,
    thumbnailUrl: image.thumbnailUrl,
  }
}

export async function sportsClubsRoutes(app: FastifyInstance) {
  app.get('/sports-clubs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.currentUser?.id ?? null

    const row = await loadSportsClubDetail(id, userId)
    if (!row) {
      return reply.code(404).send({ error: { message: 'Sports club not found' } })
    }

    return reply.send({ data: serializeSportsClub(row, userId) })
  })

  // Member self-service posting, same posture as events'/camps' feedback
  // #46/#50: goes live as 'approved' immediately, no pending step.
  app.post('/sports-clubs', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as SportsClubBody
    const validated = validateSportsClubBody(body)
    if (!validated) {
      return reply.code(400).send({ error: { message: 'title, category, and address are required' } })
    }

    const currentUser = request.currentUser!
    // sports_clubs.image_url/thumbnail_url are NOT NULL — a member who
    // doesn't attach a photo still gets a generated placeholder, same as
    // every other insert path in this codebase.
    const image =
      body.image_url && body.thumbnail_url
        ? { imageUrl: body.image_url, thumbnailUrl: body.thumbnail_url }
        : await uploadPlaceholderImage(validated.title, 'sportsclubs')

    const [created] = await db
      .insert(sportsClubs)
      .values({
        ...validated,
        ...sportsClubWriteValues(body, image),
        status: 'approved',
        submittedByUserId: currentUser.id,
      })
      .returning({ id: sportsClubs.id })

    await db.insert(eventsLog).values({ actor: currentUser.id, action: 'sports_club_created', metadata: { sportsClubId: created.id } })

    const row = (await loadSportsClubDetail(created.id, currentUser.id))!
    return reply.code(201).send({ data: serializeSportsClub(row, currentUser.id) })
  })

  app.patch('/sports-clubs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as SportsClubBody

    const currentUser = request.currentUser!
    const [existing] = await db
      .select({ submittedByUserId: sportsClubs.submittedByUserId })
      .from(sportsClubs)
      .where(and(eq(sportsClubs.id, id), isNull(sportsClubs.deletedAt)))
      .limit(1)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Sports club not found' } })
    }
    if (!canEditSportsClub(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    const validated = validateSportsClubBody(body)
    if (!validated) {
      return reply.code(400).send({ error: { message: 'title, category, and address are required' } })
    }

    // Same NOT NULL fallback as POST above — clearing a photo on edit still
    // leaves a real (generated) image behind, never null.
    const image =
      body.image_url && body.thumbnail_url
        ? { imageUrl: body.image_url, thumbnailUrl: body.thumbnail_url }
        : await uploadPlaceholderImage(validated.title, 'sportsclubs')

    await Promise.all([
      db
        .update(sportsClubs)
        .set({ ...validated, ...sportsClubWriteValues(body, image), updatedAt: new Date() })
        .where(eq(sportsClubs.id, id)),
      db.insert(eventsLog).values({ actor: currentUser.id, action: 'sports_club_updated', metadata: { sportsClubId: id } }),
    ])

    const row = (await loadSportsClubDetail(id, currentUser.id))!
    return reply.send({ data: serializeSportsClub(row, currentUser.id) })
  })

  app.delete('/sports-clubs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const currentUser = request.currentUser!

    const [existing] = await db
      .select({ submittedByUserId: sportsClubs.submittedByUserId })
      .from(sportsClubs)
      .where(and(eq(sportsClubs.id, id), isNull(sportsClubs.deletedAt)))
      .limit(1)
    if (!existing) {
      return reply.code(404).send({ error: { message: 'Sports club not found' } })
    }
    if (!canEditSportsClub(currentUser, existing)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }

    await Promise.all([
      db.update(sportsClubs).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(sportsClubs.id, id)),
      db.insert(eventsLog).values({ actor: currentUser.id, action: 'sports_club_deleted', metadata: { sportsClubId: id } }),
    ])

    return reply.code(204).send()
  })

  app.put('/sports-clubs/:id/interest', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status?: string }
    if (status !== 'interested' && status !== 'dismissed') {
      return reply.code(400).send({ error: { message: 'status must be "interested" or "dismissed"' } })
    }
    const userId = request.currentUser!.id

    const [sportsClub] = await db
      .select({ id: sportsClubs.id })
      .from(sportsClubs)
      .where(and(eq(sportsClubs.id, id), isNull(sportsClubs.deletedAt)))
      .limit(1)
    if (!sportsClub) {
      return reply.code(404).send({ error: { message: 'Sports club not found' } })
    }

    await Promise.all([
      db
        .insert(sportsClubInterests)
        .values({ userId, sportsClubId: id, status })
        .onConflictDoUpdate({
          target: [sportsClubInterests.userId, sportsClubInterests.sportsClubId],
          set: { status, deletedAt: null, updatedAt: new Date() },
        }),
      db.insert(eventsLog).values({
        actor: userId,
        action: status === 'interested' ? 'sports_club_interested' : 'sports_club_dismissed',
        metadata: { sportsClubId: id },
      }),
    ])

    return reply.code(204).send()
  })

  app.delete('/sports-clubs/:id/interest', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.currentUser!.id

    await Promise.all([
      db
        .update(sportsClubInterests)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(sportsClubInterests.userId, userId), eq(sportsClubInterests.sportsClubId, id), isNull(sportsClubInterests.deletedAt))),
      db.insert(eventsLog).values({ actor: userId, action: 'sports_club_interest_cleared', metadata: { sportsClubId: id } }),
    ])

    return reply.code(204).send()
  })

  app.get('/sports-clubs/:id/interested', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const rows = await db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(sportsClubInterests)
      .innerJoin(users, eq(users.id, sportsClubInterests.userId))
      .where(and(eq(sportsClubInterests.sportsClubId, id), eq(sportsClubInterests.status, 'interested'), isNull(sportsClubInterests.deletedAt)))
      .orderBy(asc(sportsClubInterests.createdAt))

    return reply.send({ data: rows.map((row) => ({ id: row.id, name: row.name, avatar_url: row.avatarUrl })) })
  })

  // The Sports & Clubs tab's one primary-view fetch — a flat list sorted by
  // effective start date (see sorting.ts's doc comment for the fixed_session-
  // vs-ongoing sort/hide rules). `include_started=true` bypasses the
  // hidden-by-default filter, same convention as GET /events'
  // `include_hidden` — hidden_started_count is always returned so the
  // frontend can render its reveal row regardless of which mode was
  // requested.
  app.get('/sports-clubs', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.currentUser?.id ?? null
    const { include_started } = request.query as { include_started?: string }
    const includeStarted = include_started === 'true'
    const today = todayInChicago()

    const rows = await loadAllSportsClubs(userId)
    const sortInputs: (SportsClubSortInput & { row: (typeof rows)[number] })[] = rows.map((row) => ({
      id: row.id,
      scheduleType: row.scheduleType,
      firstDate: row.firstDate,
      lastDate: row.lastDate,
      nextOccurrenceDate: row.nextOccurrenceDate,
      row,
    }))
    const sorted = sortSportsClubs(sortInputs, today)

    const hiddenStartedCount = sorted.filter((c) => c.hiddenByDefault).length
    const visible = includeStarted ? sorted : sorted.filter((c) => !c.hiddenByDefault)

    return reply.send({
      data: visible.map((c) => ({ ...serializeSportsClub({ ...c.row, source: null }, userId), hidden_by_default: c.hiddenByDefault })),
      hidden_started_count: hiddenStartedCount,
    })
  })

  app.get('/sports-club-sources', { preHandler: requireAuth }, async (_request, reply) => {
    const today = todayInChicago()
    const rows = await db
      .select({
        id: sportsClubSources.id,
        name: sportsClubSources.name,
        url: sportsClubSources.url,
        type: sportsClubSources.type,
        sportsClubCount: sql<number>`count(*) filter (where ${sportsClubs.status} = 'approved' and (${sportsClubs.lastDate} is null or ${sportsClubs.lastDate} >= ${today}))::int`,
      })
      .from(sportsClubSources)
      .leftJoin(sportsClubs, and(eq(sportsClubs.sourceId, sportsClubSources.id), isNull(sportsClubs.deletedAt)))
      .where(and(eq(sportsClubSources.isActive, true), isNull(sportsClubSources.deletedAt)))
      .groupBy(sportsClubSources.id, sportsClubSources.name, sportsClubSources.url, sportsClubSources.type)
      .orderBy(asc(sportsClubSources.name))

    return reply.send({
      data: rows.map((row) => ({ id: row.id, name: row.name, url: row.url, type: row.type, sports_club_count: row.sportsClubCount })),
      has_more: false,
      next_cursor: null,
    })
  })

  // Admin-only from day one (feedback #102 precedent, applied directly here
  // rather than migrated later — see CLAUDE.md's Events "Toolbar icon
  // consolidation" bullet). Only ever "provider_website" in practice, same
  // reasoning as camp_sources — hardcoded rather than a client-supplied field.
  app.post('/sports-club-sources', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as { name?: string; url?: string; notes?: string }
    const name = body.name?.trim()
    const url = body.url?.trim()
    if (!name || !url) {
      return reply.code(400).send({ error: { message: 'name and url are required' } })
    }

    const currentUser = request.currentUser!
    const [created] = await db
      .insert(sportsClubSources)
      .values({ name, url, type: 'provider_website', notes: body.notes?.trim() || null, isActive: true })
      .returning({ id: sportsClubSources.id })

    await db.insert(eventsLog).values({
      actor: currentUser.id,
      action: 'sports_club_source_created',
      metadata: { sourceId: created.id },
    })

    return reply.code(201).send({ data: { id: created.id, name, url, type: 'provider_website', sports_club_count: 0 } })
  })

  app.get('/sports-club-sources/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const today = todayInChicago()
    const allSourceConditions = and(eq(sportsClubs.sourceId, id), isNull(sportsClubs.deletedAt))
    const upcomingSourceConditions = and(allSourceConditions, sql`(${sportsClubs.lastDate} is null or ${sportsClubs.lastDate} >= ${today})`)

    const [[source], sourceSportsClubs, [{ lastAddedAt }]] = await Promise.all([
      db
        .select()
        .from(sportsClubSources)
        .where(and(eq(sportsClubSources.id, id), isNull(sportsClubSources.deletedAt)))
        .limit(1),
      db
        .select({
          id: sportsClubs.id,
          title: sportsClubs.title,
          scheduleType: sportsClubs.scheduleType,
          firstDate: sportsClubs.firstDate,
          lastDate: sportsClubs.lastDate,
          status: sportsClubs.status,
        })
        .from(sportsClubs)
        .where(upcomingSourceConditions)
        .orderBy(asc(sportsClubs.title)),
      db.select({ lastAddedAt: sql<string | null>`max(${sportsClubs.createdAt})` }).from(sportsClubs).where(allSourceConditions),
    ])

    if (!source) {
      return reply.code(404).send({ error: { message: 'Source not found' } })
    }

    const sportsClubCount = sourceSportsClubs.filter((c) => c.status === 'approved').length

    return reply.send({
      data: {
        id: source.id,
        name: source.name,
        url: source.url,
        type: source.type,
        notes: source.notes,
        is_active: source.isActive,
        last_checked_at: source.lastCheckedAt,
        last_sports_club_added_at: lastAddedAt,
        is_stale: isSourceStale(lastAddedAt ? new Date(lastAddedAt) : null),
        sports_club_count: sportsClubCount,
        sports_clubs: sourceSportsClubs.map((c) => ({
          id: c.id,
          title: c.title,
          schedule_type: c.scheduleType,
          first_date: c.firstDate,
          last_date: c.lastDate,
          status: c.status,
        })),
      },
    })
  })

  // Cross-listing notes, same shape/rationale as camps' GET
  // /camps/:id/source-notes — comments left on OTHER listings sharing this
  // one's source, so e.g. viewing one Park District league surfaces notes
  // people left about other Park District listings too. A self-submitted
  // listing has no source, so it always returns empty rather than querying.
  app.get('/sports-clubs/:id/source-notes', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [sportsClub] = await db
      .select({ sourceId: sportsClubs.sourceId })
      .from(sportsClubs)
      .where(and(eq(sportsClubs.id, id), isNull(sportsClubs.deletedAt)))
      .limit(1)
    if (!sportsClub) {
      return reply.code(404).send({ error: { message: 'Sports club not found' } })
    }
    if (!sportsClub.sourceId) {
      return reply.send({ data: [], has_more: false, next_cursor: null })
    }

    const rows = await db
      .select({
        id: sportsClubComments.id,
        body: sportsClubComments.body,
        createdAt: sportsClubComments.createdAt,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
        sportsClubId: sportsClubs.id,
        sportsClubTitle: sportsClubs.title,
      })
      .from(sportsClubComments)
      .innerJoin(sportsClubs, eq(sportsClubs.id, sportsClubComments.sportsClubId))
      .innerJoin(users, eq(users.id, sportsClubComments.userId))
      .where(
        and(
          eq(sportsClubs.sourceId, sportsClub.sourceId),
          sql`${sportsClubs.id} != ${id}`,
          isNull(sportsClubs.deletedAt),
          isNull(sportsClubComments.deletedAt),
        ),
      )
      .orderBy(sql`${sportsClubComments.createdAt} desc`)

    return reply.send({
      data: rows.map((row) => ({
        id: row.id,
        body: row.body,
        created_at: row.createdAt,
        author_name: row.authorName,
        author_avatar_url: row.authorAvatarUrl,
        sports_club_id: row.sportsClubId,
        sports_club_title: row.sportsClubTitle,
      })),
      has_more: false,
      next_cursor: null,
    })
  })
}
