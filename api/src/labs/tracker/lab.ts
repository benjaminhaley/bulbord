import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { Lab, LabContext } from '../sandbox.js'
import { trackerDb, trackerEntries, trackerItems } from './db.js'

// Tracker (Labs). Each member has their own private list of goals. Every goal
// has a title, a description, a question that turns it red when it's due, and a
// 0-100% score, which builds up over time (feedback #189). Every goal is made of
// the same parts (2026-11-16, Ben: every setting available to every type):
// - When it asks (the goal's `type`; its own setting in brackets):
//   - plan: red until the next one is on the calendar (none).
//   - progress: red once the last entry is more than [stale_days] old.
//   - checkin: each chosen [weekdays] is answered Yes or No (stored kept or
//     missed), one answer per day; red until the most recent one is answered.
//     Every day of the week is the old "some days a week" goal.
//   - often: any number of Yes or No answers; red once the last is
//     [every_hours] old.
// - The goal: target_count a week, every 2 weeks, every 4 weeks or a year
//   (target_period_days), any type: the score is how much of it was reached.
// - The question's wording and which answers ask for a note.
// The page derives red and the score from the entries in the viewer's own time
// zone. This file enforces each type's entry rules, against the viewer's
// `today` that the page sends. Entries are soft-deleted only, which doubles as
// this lab's own history — labs never write to the app's events_log.
const GOAL_TYPES = ['plan', 'progress', 'checkin', 'often'] as const
type GoalType = (typeof GOAL_TYPES)[number]
const DEFAULT_GOALS = ['Date with Anna', 'Playdate for Sebrin', 'Fun trip', 'Hang with a friend']
const MAX_NAME = 80
const MAX_DESCRIPTION = 500
const MAX_QUESTION = 120
const MAX_NOTE = 200
const PERIOD_DAYS = [7, 14, 28, 365] // 365 = a year (2026-11-16, Ben: "twice a year")
const DEFAULT_STALE_DAYS = 14
const MAX_STALE_DAYS = 3650
const DEFAULT_EVERY_HOURS = 6
const MAX_EVERY_HOURS = 168
const MAX_TARGET = 365
// A new goal's target, a week, when none is given; a check-in's is every chosen day.
const DEFAULT_TARGET: Record<GoalType, number> = { plan: 1, progress: 1, checkin: 7, often: 10 }
const OUTCOMES = ['kept', 'missed']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Item = typeof trackerItems.$inferSelect
type Entry = typeof trackerEntries.$inferSelect
type ItemBody = { name?: unknown; description?: unknown; question?: unknown; ask_note?: unknown; ask_note_no?: unknown; type?: unknown; stale_days?: unknown; weekdays?: unknown; every_hours?: unknown; target_count?: unknown; target_period_days?: unknown }

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

function parseBool(value: unknown, what: string) {
  if (typeof value !== 'boolean') throw badRequest(`${what} must be true or false`)
  return value
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

function wholeNumber(value: unknown, max: number, message: string) {
  if (!(Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max)) throw badRequest(message)
  return value as number
}

// The type's own setting, from a create or a type change (every one, with
// defaults) or an edit (only what's given). A setting of another type is an
// error.
function parseSettings(type: GoalType, body: ItemBody, creating: boolean): Partial<Item> {
  const settings: Partial<Item> = {}
  const wanted = (key: keyof ItemBody, owner: GoalType) => {
    if (body[key] === undefined) return creating && type === owner
    if (type !== owner) throw badRequest(`Only a ${owner} goal has ${key}`)
    return true
  }
  if (wanted('stale_days', 'progress')) {
    settings.staleDays = wholeNumber(body.stale_days ?? DEFAULT_STALE_DAYS, MAX_STALE_DAYS, `Days must be a whole number from 1 to ${MAX_STALE_DAYS}`)
  }
  if (wanted('weekdays', 'checkin')) {
    const days = body.weekdays
    if (!Array.isArray(days) || days.length === 0 || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      throw badRequest('Pick at least one day of the week')
    }
    settings.weekdays = [...new Set(days as number[])].sort().join(',')
  }
  if (wanted('every_hours', 'often')) {
    settings.everyHours = wholeNumber(body.every_hours ?? DEFAULT_EVERY_HOURS, MAX_EVERY_HOURS, `Hours must be a whole number from 1 to ${MAX_EVERY_HOURS}`)
  }
  return settings
}

// The goal, any type: target_count in each target_period_days. Given values
// are checked; then it's fitted to the type (a check-in can't aim for more
// days than it asks about, and starts at every one of them).
function fitTarget(type: GoalType, body: ItemBody, current: { count: number | null; period: number | null }, weekdays: string | null) {
  const period = body.target_period_days === undefined ? (current.period ?? 7) : (body.target_period_days as number)
  if (!PERIOD_DAYS.includes(period)) throw badRequest('The goal must be per 7, 14, 28 or 365 days')
  const max = type === 'checkin' && weekdays ? Math.floor((weekdays.split(',').length * period) / 7) : MAX_TARGET
  let count = current.count ?? (type === 'checkin' ? max : DEFAULT_TARGET[type])
  if (body.target_count !== undefined) count = wholeNumber(body.target_count, MAX_TARGET, `The goal must be a whole number from 1 to ${MAX_TARGET}`)
  return { targetCount: Math.min(count, max), targetPeriodDays: period }
}

// These goals record a day kept or missed, one record per day.
function recordsDays(item: Item) {
  return item.type === 'checkin'
}

// These goals' entries are answers, with no date or note to edit.
function takesAnswers(item: Item) {
  return recordsDays(item) || item.type === 'often'
}

function serializeEntry(e: Entry) {
  return { id: e.id, date: e.date, at: e.createdAt.toISOString(), note: e.note, outcome: e.outcome }
}

function serializeItem(item: Item, entries: Entry[] = []) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    question: item.question,
    ask_note: item.askNote,
    ask_note_no: item.askNoteNo,
    type: item.type,
    stale_days: item.staleDays,
    weekdays: item.weekdays ? item.weekdays.split(',').map(Number) : null,
    every_hours: item.everyHours,
    target_count: item.targetCount,
    target_period_days: item.targetPeriodDays,
    created_at: item.createdAt.toISOString(),
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
        .values(DEFAULT_GOALS.map((name, position) => ({ userId, name, position, targetCount: 1, targetPeriodDays: 7 })))
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
    const settings = parseSettings(type, body, true)
    const [item] = await db
      .insert(trackerItems)
      .values({
        userId,
        type,
        name: parseText(body.name, MAX_NAME, 'Title', true),
        description: parseText(body.description, MAX_DESCRIPTION, 'Description', false),
        question: parseText(body.question, MAX_QUESTION, 'Question', false),
        ...(body.ask_note === undefined ? {} : { askNote: parseBool(body.ask_note, 'ask_note') }),
        ...(body.ask_note_no === undefined ? {} : { askNoteNo: parseBool(body.ask_note_no, 'ask_note_no') }),
        ...settings,
        ...fitTarget(type, body, { count: null, period: null }, settings.weekdays ?? null),
        position: sql`(select coalesce(max(position) + 1, 0) from ${trackerItems} where ${trackerItems.userId} = ${userId})`,
      })
      .returning()
    return reply.code(201).send(serializeItem(item))
  })

  // Everything about a goal can change, its type too (2026-11-15, Ben: Settings
  // should cover every option goals have). A new type gets its own settings
  // (given, or the defaults) and the old type's are cleared; its entries are
  // carried over: going to a type with Yes / No answers, a logged date becomes
  // a Yes; going to plan or progress, a No is soft-deleted (it would read as
  // done) and a Yes becomes a plain logged date.
  app.patch<{ Params: { id: string }; Body: ItemBody }>('/items/:id', async (request) => {
    const db = await database()
    const body = request.body ?? {}
    const item = await findItem(request.params.id, member(request))
    const newType = (body.type ?? item.type) as GoalType
    if (!GOAL_TYPES.includes(newType)) throw badRequest('Unknown goal type')
    const typeChanges = newType !== item.type

    const changes: Partial<Item> = typeChanges
      ? { type: newType, staleDays: null, weekdays: null, everyHours: null, ...parseSettings(newType, body, true) }
      : parseSettings(item.type as GoalType, body, false)
    // The goal carries over; a check-in's is refitted to its days. A
    // check-in that was aiming for every one of its days keeps doing so when
    // its days change.
    const weekdays = changes.weekdays !== undefined ? changes.weekdays : item.weekdays
    const everyDay = item.type === 'checkin' && item.weekdays && item.targetCount === item.weekdays.split(',').length * ((item.targetPeriodDays ?? 7) / 7)
    const target = fitTarget(newType, body, { count: everyDay && changes.weekdays ? null : item.targetCount, period: item.targetPeriodDays }, weekdays)
    if (target.targetCount !== item.targetCount || target.targetPeriodDays !== item.targetPeriodDays) Object.assign(changes, target)
    if (body.name !== undefined) changes.name = parseText(body.name, MAX_NAME, 'Title', true)
    if (body.description !== undefined) changes.description = parseText(body.description, MAX_DESCRIPTION, 'Description', false)
    if (body.question !== undefined) changes.question = parseText(body.question, MAX_QUESTION, 'Question', false)
    if (body.ask_note !== undefined) changes.askNote = parseBool(body.ask_note, 'ask_note')
    if (body.ask_note_no !== undefined) changes.askNoteNo = parseBool(body.ask_note_no, 'ask_note_no')
    if (Object.keys(body).length === 0) throw badRequest('Nothing to change')
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(trackerItems).set({ ...changes, updatedAt: new Date() }).where(eq(trackerItems.id, item.id)).returning()
      const wasAnswers = takesAnswers(item), isAnswers = takesAnswers(row)
      const live = and(eq(trackerEntries.itemId, item.id), isNull(trackerEntries.deletedAt))
      if (isAnswers && !wasAnswers) {
        await tx.update(trackerEntries).set({ outcome: 'kept', updatedAt: new Date() }).where(and(live, isNull(trackerEntries.outcome)))
      } else if (wasAnswers && !isAnswers) {
        await tx.update(trackerEntries).set({ deletedAt: new Date() }).where(and(live, eq(trackerEntries.outcome, 'missed')))
        await tx.update(trackerEntries).set({ outcome: null, updatedAt: new Date() }).where(live)
      }
      return row
    })
    return serializeItem(updated)
  })

  app.delete<{ Params: { id: string } }>('/items/:id', async (request) => {
    const db = await database()
    const item = await findItem(request.params.id, member(request))
    await db.update(trackerItems).set({ deletedAt: new Date() }).where(eq(trackerItems.id, item.id))
    return { id: item.id, deleted: true }
  })

  // `today` is the viewer's own date (the server's UTC date if not given).
  // plan: there's only ever one future plan, so a date after today replaces it
  // (the old one stays as a soft-deleted row); today or earlier is just logged.
  // progress: today or earlier. checkin: today or earlier, on one of the
  // goal's weekdays, kept or missed; a new record replaces that day's old one.
  // often: any number of answers, kept (Yes) or
  // missed (No), today or earlier.
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

      if (takesAnswers(item)) {
        if (!OUTCOMES.includes(body.outcome as string)) throw badRequest('Say whether the day was kept or missed')
        if (item.type === 'checkin' && !item.weekdays?.split(',').includes(String(weekdayOf(date)))) throw badRequest('That day isn’t one of this goal’s days')
      } else if (body.outcome !== undefined) {
        throw badRequest('Only a goal with answers takes kept or missed')
      }
      if (item.type !== 'plan' && date > today) throw badRequest('Pick today or an earlier day')

      const replaces =
        item.type === 'plan' && date > today
          ? gt(trackerEntries.date, today)
          : recordsDays(item)
            ? eq(trackerEntries.date, date)
            : null
      const entry = await db.transaction(async (tx) => {
        if (replaces) {
          await tx
            .update(trackerEntries)
            .set({ deletedAt: new Date() })
            .where(and(eq(trackerEntries.itemId, item.id), isNull(trackerEntries.deletedAt), replaces))
        }
        const outcome = takesAnswers(item) ? (body.outcome as string) : null
        const [inserted] = await tx.insert(trackerEntries).values({ itemId: item.id, userId, date, note, outcome }).returning()
        return inserted
      })
      return reply.code(201).send(serializeEntry(entry))
    },
  )

  // Tap-to-edit an entry's date or note. A check-in day has no date or note to
  // edit (answering again replaces it). The same date rules as adding apply.
  app.patch<{ Params: { id: string }; Body: { date?: unknown; note?: unknown; today?: unknown } }>('/entries/:id', async (request) => {
    const db = await database()
    if (!UUID_RE.test(request.params.id)) throw notFound()
    const body = request.body ?? {}
    const userId = member(request)
    const [entry] = await db
      .select()
      .from(trackerEntries)
      .where(and(eq(trackerEntries.id, request.params.id), eq(trackerEntries.userId, userId), isNull(trackerEntries.deletedAt)))
    if (!entry) throw notFound()
    const item = await findItem(entry.itemId, userId)
    if (takesAnswers(item)) throw badRequest('Answer again to change it')

    const date = body.date === undefined ? entry.date : parseDate(body.date)
    const note = body.note === undefined ? entry.note : parseText(body.note, MAX_NOTE, 'Note', false)
    const today = body.today === undefined ? utcToday() : parseDate(body.today, 'today')
    if (item.type !== 'plan' && date > today) throw badRequest('Pick today or an earlier day')

    const updated = await db.transaction(async (tx) => {
      if (item.type === 'plan' && date > today) {
        await tx
          .update(trackerEntries)
          .set({ deletedAt: new Date() })
          .where(and(eq(trackerEntries.itemId, item.id), isNull(trackerEntries.deletedAt), gt(trackerEntries.date, today), ne(trackerEntries.id, entry.id)))
      }
      const [row] = await tx.update(trackerEntries).set({ date, note, updatedAt: new Date() }).where(eq(trackerEntries.id, entry.id)).returning()
      return row
    })
    return serializeEntry(updated)
  })

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
