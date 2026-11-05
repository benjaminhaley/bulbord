import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { Lab, LabContext } from '../sandbox.js'
import { trackerDb, trackerEntries, trackerItems } from './db.js'

// Tracker (Labs). Each member has their own private list of goals. Every goal
// has a title, a description, a key action that turns it red when it can be
// done today, and a 0-100% score over the last 8 weeks, which builds up over
// time (feedback #189). The type decides the key action and the score:
// - plan ("plan ahead", e.g. see friends): red until the next one is on the
//   calendar; scored by how many of the last 8 weeks' periods (every 1, 2 or 4
//   weeks) had one.
// - progress ("keep making progress"): red once the last entry is more than
//   stale_days old; scored by how many of the last 8 weeks had one.
// - checkin ("check in on set days", e.g. no drinking on Sundays and Mondays):
//   each chosen weekday is recorded kept or missed; red while one in the last
//   8 weeks is unrecorded; scored by kept days out of chosen days.
// The page derives red and the score from the entries in the viewer's own time
// zone. This file enforces each type's entry rules, against the viewer's
// `today` that the page sends. Entries are soft-deleted only, which doubles as
// this lab's own history — labs never write to the app's events_log.
const GOAL_TYPES = ['plan', 'progress', 'checkin'] as const
type GoalType = (typeof GOAL_TYPES)[number]
const DEFAULT_GOALS = ['Date with Anna', 'Playdate for Sebrin', 'Fun trip', 'Hang with a friend']
const MAX_NAME = 80
const MAX_DESCRIPTION = 500
const MAX_NOTE = 200
const PERIOD_DAYS = [7, 14, 28]
const DEFAULT_PERIOD_DAYS = 7
const DEFAULT_STALE_DAYS = 14
const MAX_STALE_DAYS = 3650
const OUTCOMES = ['kept', 'missed']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Item = typeof trackerItems.$inferSelect
type Entry = typeof trackerEntries.$inferSelect
type ItemBody = { name?: unknown; description?: unknown; type?: unknown; period_days?: unknown; stale_days?: unknown; weekdays?: unknown }

// Thrown by the parsers below; the scope's error handler answers it.
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
const badRequest = (message: string) => new HttpError(400, message)
const notFound = () => new HttpError(404, 'Not found')

function parseText(value: unknown, max: number, what: string, required: boolean) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (required && !text) throw badRequest(`${what} is required (max ${max} characters)`)
  if (text.length > max) throw badRequest(`${what} is too long (max ${max} characters)`)
  return text
}

function parseDate(value: unknown, what = 'date') {
  if (typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(value))) return value
  throw badRequest(`A valid ${what} is required`)
}

function utcToday() {
  return new Date().toISOString().slice(0, 10)
}

function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

// The type's own setting, from a create (every one, with defaults) or an
// edit (only what's given). A setting of another type is an error.
function parseSettings(type: GoalType, body: ItemBody, creating: boolean): Partial<Item> {
  const settings: Partial<Item> = {}
  const wanted = (key: keyof ItemBody, owner: GoalType) => {
    if (body[key] === undefined) return creating && type === owner
    if (type !== owner) throw badRequest(`Only a ${owner} goal has ${key}`)
    return true
  }
  if (wanted('period_days', 'plan')) {
    const days = body.period_days ?? DEFAULT_PERIOD_DAYS
    if (!PERIOD_DAYS.includes(days as number)) throw badRequest('How often must be every 7, 14 or 28 days')
    settings.periodDays = days as number
  }
  if (wanted('stale_days', 'progress')) {
    const days = body.stale_days ?? DEFAULT_STALE_DAYS
    if (!(Number.isInteger(days) && (days as number) >= 1 && (days as number) <= MAX_STALE_DAYS)) {
      throw badRequest(`Days must be a whole number from 1 to ${MAX_STALE_DAYS}`)
    }
    settings.staleDays = days as number
  }
  if (wanted('weekdays', 'checkin')) {
    const days = body.weekdays
    if (!Array.isArray(days) || days.length === 0 || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      throw badRequest('Pick at least one day of the week')
    }
    settings.weekdays = [...new Set(days as number[])].sort().join(',')
  }
  return settings
}

function serializeEntry(e: Entry) {
  return { id: e.id, date: e.date, note: e.note, outcome: e.outcome }
}

function serializeItem(item: Item, entries: Entry[] = []) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type,
    period_days: item.periodDays,
    stale_days: item.staleDays,
    weekdays: item.weekdays ? item.weekdays.split(',').map(Number) : null,
    entries: entries.map(serializeEntry),
  }
}

export const tracker: Lab = { name: 'tracker', database: true, plugin: trackerRoutes }

async function trackerRoutes(app: FastifyInstance, ctx: LabContext) {
  // Members only: every query below is scoped to the member's id, so one
  // member's goals are invisible (404) to everyone else.
  app.addHook('preHandler', async (request, reply) => {
    if (!ctx.memberId(request)) return reply.code(401).send({ error: { message: 'Sign in to Bulbord to use the tracker' } })
  })
  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: { message: err.message } })
    return reply.send(err)
  })
  const member = (request: FastifyRequest) => ctx.memberId(request)!
  const database = () => trackerDb(ctx)

  async function findItem(id: string, userId: string) {
    if (!UUID_RE.test(id)) throw notFound()
    const db = await database()
    const [item] = await db
      .select()
      .from(trackerItems)
      .where(and(eq(trackerItems.id, id), eq(trackerItems.userId, userId), isNull(trackerItems.deletedAt)))
    if (!item) throw notFound()
    return item
  }

  app.get('/items', async (request) => {
    const db = await database()
    const userId = member(request)

    // Deleted goals are read too, so the defaults are seeded only on a
    // member's very first visit.
    let items = await db.select().from(trackerItems).where(eq(trackerItems.userId, userId)).orderBy(asc(trackerItems.position), asc(trackerItems.createdAt))
    if (items.length === 0) {
      items = await db
        .insert(trackerItems)
        .values(DEFAULT_GOALS.map((name, position) => ({ userId, name, position, periodDays: DEFAULT_PERIOD_DAYS })))
        .returning()
    }
    items = items.filter((item) => !item.deletedAt)

    const entries = items.length
      ? await db
          .select()
          .from(trackerEntries)
          .where(and(inArray(trackerEntries.itemId, items.map((i) => i.id)), isNull(trackerEntries.deletedAt)))
          .orderBy(desc(trackerEntries.date), desc(trackerEntries.createdAt))
      : []
    const entriesByItem = new Map<string, Entry[]>()
    for (const e of entries) entriesByItem.set(e.itemId, [...(entriesByItem.get(e.itemId) ?? []), e])
    return { data: items.map((item) => serializeItem(item, entriesByItem.get(item.id))) }
  })

  app.post<{ Body: ItemBody }>('/items', async (request, reply) => {
    const db = await database()
    const body = request.body ?? {}
    const type = (body.type ?? 'plan') as GoalType
    if (!GOAL_TYPES.includes(type)) throw badRequest('Unknown goal type')
    const userId = member(request)
    const [item] = await db
      .insert(trackerItems)
      .values({
        userId,
        type,
        name: parseText(body.name, MAX_NAME, 'Title', true),
        description: parseText(body.description, MAX_DESCRIPTION, 'Description', false),
        ...parseSettings(type, body, true),
        position: sql`(select coalesce(max(position) + 1, 0) from ${trackerItems} where ${trackerItems.userId} = ${userId})`,
      })
      .returning()
    return reply.code(201).send(serializeItem(item))
  })

  // A goal's type is fixed; its title, description and setting can change.
  app.patch<{ Params: { id: string }; Body: ItemBody }>('/items/:id', async (request) => {
    const db = await database()
    const body = request.body ?? {}
    const item = await findItem(request.params.id, member(request))
    if (body.type !== undefined && body.type !== item.type) throw badRequest("A goal's type can't change")

    const changes: Partial<Item> = parseSettings(item.type as GoalType, body, false)
    if (body.name !== undefined) changes.name = parseText(body.name, MAX_NAME, 'Title', true)
    if (body.description !== undefined) changes.description = parseText(body.description, MAX_DESCRIPTION, 'Description', false)
    if (Object.keys(changes).length === 0) throw badRequest('Nothing to change')
    const [updated] = await db.update(trackerItems).set({ ...changes, updatedAt: new Date() }).where(eq(trackerItems.id, item.id)).returning()
    return serializeItem(updated)
  })

  app.delete<{ Params: { id: string } }>('/items/:id', async (request) => {
    const db = await database()
    const item = await findItem(request.params.id, member(request))
    await db.update(trackerItems).set({ deletedAt: new Date() }).where(eq(trackerItems.id, item.id))
    return { id: item.id, deleted: true }
  })

  // `today` is the viewer's own date (the server's UTC date if not given).
  // plan: there's only ever one next one, so an entry dated today or later
  // replaces the upcoming one (which stays in history, soft-deleted).
  // progress: today or earlier. checkin: today or earlier, on one of the
  // goal's weekdays, kept or missed; a new record replaces that day's old one.
  app.post<{ Params: { id: string }; Body: { date?: unknown; note?: unknown; outcome?: unknown; today?: unknown } }>(
    '/items/:id/entries',
    async (request, reply) => {
      const db = await database()
      const body = request.body ?? {}
      const date = parseDate(body.date)
      const today = body.today === undefined ? utcToday() : parseDate(body.today, 'today')
      const note = parseText(body.note, MAX_NOTE, 'Note', false)
      const userId = member(request)
      const item = await findItem(request.params.id, userId)

      if (item.type === 'checkin') {
        if (!OUTCOMES.includes(body.outcome as string)) throw badRequest('Say whether the day was kept or missed')
        if (!item.weekdays?.split(',').includes(String(weekdayOf(date)))) throw badRequest('That day isn’t one of this goal’s days')
      } else if (body.outcome !== undefined) {
        throw badRequest('Only a check-in goal records kept or missed')
      }
      if (item.type !== 'plan' && date > today) throw badRequest('Pick today or an earlier day')

      const replaces =
        item.type === 'plan' && date >= today
          ? gte(trackerEntries.date, today)
          : item.type === 'checkin'
            ? eq(trackerEntries.date, date)
            : null
      const entry = await db.transaction(async (tx) => {
        if (replaces) {
          await tx
            .update(trackerEntries)
            .set({ deletedAt: new Date() })
            .where(and(eq(trackerEntries.itemId, item.id), isNull(trackerEntries.deletedAt), replaces))
        }
        const outcome = item.type === 'checkin' ? (body.outcome as string) : null
        const [inserted] = await tx.insert(trackerEntries).values({ itemId: item.id, userId, date, note, outcome }).returning()
        return inserted
      })
      return reply.code(201).send(serializeEntry(entry))
    },
  )

  app.delete<{ Params: { id: string } }>('/entries/:id', async (request) => {
    const db = await database()
    if (!UUID_RE.test(request.params.id)) throw notFound()
    const deleted = await db
      .update(trackerEntries)
      .set({ deletedAt: new Date() })
      .where(and(eq(trackerEntries.id, request.params.id), eq(trackerEntries.userId, member(request)), isNull(trackerEntries.deletedAt)))
      .returning({ id: trackerEntries.id })
    if (deleted.length === 0) throw notFound()
    return { id: request.params.id, deleted: true }
  })
}
