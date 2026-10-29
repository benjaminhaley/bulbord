import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { Lab, LabContext } from '../sandbox.js'
import { trackerDb, trackerEntries, trackerItems } from './db.js'

// Tracker (Labs). Each member has their own private list of items, of two
// kinds: a "next" item ("when's the next one?") and a "log" (a group of
// projects, each showing how long since its last progress). An entry is a date
// + short note on a next item or a project; entries can be past or future, and
// the page derives everything (next one, last one, red or not) from them in the
// viewer's own time zone. Entries are soft-deleted only, which doubles as this
// lab's own history — labs never write to the app's events_log.
const DEFAULT_ITEMS = ['Date with Anna', 'Playdate for Sebrin', 'Fun trip', 'Hang with a friend']
const MAX_NAME = 80
const MAX_NOTE = 200
const DEFAULT_STALE_DAYS = 14
const MAX_STALE_DAYS = 3650
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Item = typeof trackerItems.$inferSelect
type Entry = typeof trackerEntries.$inferSelect

function badRequest(message: string) {
  return { error: { message } }
}

function parseName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : ''
  return name && name.length <= MAX_NAME ? name : null
}

function parseStaleDays(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_STALE_DAYS ? value : null
}

function parseDate(value: unknown) {
  return typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(value)) ? value : null
}

function serializeEntry(e: Entry) {
  return { id: e.id, date: e.date, note: e.note, created_at: e.createdAt }
}

export const tracker: Lab = { name: 'tracker', database: true, plugin: trackerRoutes }

async function trackerRoutes(app: FastifyInstance, ctx: LabContext) {
  // Members only: every query below is scoped to the member's id, so one
  // member's items are invisible (404) to everyone else.
  app.addHook('preHandler', async (request, reply) => {
    if (!ctx.memberId(request)) return reply.code(401).send(badRequest('Sign in to Bulbord to use the tracker'))
  })
  const member = (request: FastifyRequest) => ctx.memberId(request)!
  const database = () => trackerDb(ctx)

  async function findItem(id: string, userId: string) {
    if (!UUID_RE.test(id)) return null
    const db = await database()
    const [item] = await db
      .select()
      .from(trackerItems)
      .where(and(eq(trackerItems.id, id), eq(trackerItems.userId, userId), isNull(trackerItems.deletedAt)))
    return item ?? null
  }

  app.get('/items', async (request) => {
    const db = await database()
    const userId = member(request)

    const anyEver = await db.select({ id: trackerItems.id }).from(trackerItems).where(eq(trackerItems.userId, userId)).limit(1)
    if (anyEver.length === 0) {
      await db.insert(trackerItems).values(DEFAULT_ITEMS.map((name, position) => ({ userId, name, position })))
    }

    const items = await db
      .select()
      .from(trackerItems)
      .where(and(eq(trackerItems.userId, userId), isNull(trackerItems.deletedAt)))
      .orderBy(asc(trackerItems.position), asc(trackerItems.createdAt))
    const entries = items.length
      ? await db
          .select()
          .from(trackerEntries)
          .where(and(inArray(trackerEntries.itemId, items.map((i) => i.id)), isNull(trackerEntries.deletedAt)))
          .orderBy(desc(trackerEntries.date), desc(trackerEntries.createdAt))
      : []

    const entriesOf = (item: Item) => entries.filter((e) => e.itemId === item.id).map(serializeEntry)
    return {
      data: items
        .filter((item) => !item.parentId)
        .map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          stale_days: item.kind === 'log' ? (item.staleDays ?? DEFAULT_STALE_DAYS) : null,
          entries: entriesOf(item),
          projects: items
            .filter((child) => child.parentId === item.id)
            .map((child) => ({ id: child.id, name: child.name, entries: entriesOf(child) })),
        })),
    }
  })

  // A top-level item ({name, kind: 'next' | 'log', stale_days}) or a project
  // inside a log ({name, parent_id}).
  app.post<{ Body: { name?: unknown; kind?: unknown; stale_days?: unknown; parent_id?: unknown } }>('/items', async (request, reply) => {
    const db = await database()
    const body = request.body ?? {}
    const name = parseName(body.name)
    if (!name) return reply.code(400).send(badRequest(`Name is required (max ${MAX_NAME} characters)`))
    const userId = member(request)

    let kind = 'next'
    let staleDays: number | null = null
    let parentId: string | null = null
    if (body.parent_id != null) {
      const parent = typeof body.parent_id === 'string' ? await findItem(body.parent_id, userId) : null
      if (!parent || parent.kind !== 'log') return reply.code(404).send(badRequest('Not found'))
      kind = 'project'
      parentId = parent.id
    } else if (body.kind === 'log') {
      kind = 'log'
      staleDays = body.stale_days == null ? DEFAULT_STALE_DAYS : parseStaleDays(body.stale_days)
      if (staleDays == null) return reply.code(400).send(badRequest(`Days must be a whole number from 1 to ${MAX_STALE_DAYS}`))
    } else if (body.kind != null && body.kind !== 'next') {
      return reply.code(400).send(badRequest('Unknown kind'))
    }

    const siblings = await db
      .select({ position: trackerItems.position })
      .from(trackerItems)
      .where(and(eq(trackerItems.userId, userId), parentId ? eq(trackerItems.parentId, parentId) : isNull(trackerItems.parentId)))
    const position = siblings.reduce((max, r) => Math.max(max, r.position + 1), 0)
    const [item] = await db.insert(trackerItems).values({ userId, name, kind, staleDays, parentId, position }).returning()
    return reply.code(201).send({ id: item.id, name: item.name, kind: item.kind, stale_days: item.staleDays, entries: [], projects: [] })
  })

  app.patch<{ Params: { id: string }; Body: { name?: unknown; stale_days?: unknown } }>('/items/:id', async (request, reply) => {
    const db = await database()
    const body = request.body ?? {}
    const item = await findItem(request.params.id, member(request))
    if (!item) return reply.code(404).send(badRequest('Not found'))

    const changes: Partial<Item> = {}
    if (body.name !== undefined) {
      const name = parseName(body.name)
      if (!name) return reply.code(400).send(badRequest(`Name is required (max ${MAX_NAME} characters)`))
      changes.name = name
    }
    if (body.stale_days !== undefined) {
      const staleDays = parseStaleDays(body.stale_days)
      if (item.kind !== 'log') return reply.code(400).send(badRequest('Only a log has a days setting'))
      if (staleDays == null) return reply.code(400).send(badRequest(`Days must be a whole number from 1 to ${MAX_STALE_DAYS}`))
      changes.staleDays = staleDays
    }
    if (Object.keys(changes).length === 0) return reply.code(400).send(badRequest('Nothing to change'))
    const [updated] = await db.update(trackerItems).set({ ...changes, updatedAt: new Date() }).where(eq(trackerItems.id, item.id)).returning()
    return { id: updated.id, name: updated.name, stale_days: updated.staleDays }
  })

  // Deleting a log deletes its projects too.
  app.delete<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const db = await database()
    const item = await findItem(request.params.id, member(request))
    if (!item) return reply.code(404).send(badRequest('Not found'))
    await db
      .update(trackerItems)
      .set({ deletedAt: new Date() })
      .where(and(or(eq(trackerItems.id, item.id), eq(trackerItems.parentId, item.id)), isNull(trackerItems.deletedAt)))
    return { id: item.id, deleted: true }
  })

  // On a next item or a project (a log's entries live on its projects).
  app.post<{ Params: { id: string }; Body: { date?: unknown; note?: unknown } }>('/items/:id/entries', async (request, reply) => {
    const db = await database()
    const date = parseDate(request.body?.date)
    const note = typeof request.body?.note === 'string' ? request.body.note.trim() : ''
    if (!date) return reply.code(400).send(badRequest('A valid date is required'))
    if (note.length > MAX_NOTE) return reply.code(400).send(badRequest(`Note is too long (max ${MAX_NOTE} characters)`))
    const userId = member(request)
    const item = await findItem(request.params.id, userId)
    if (!item) return reply.code(404).send(badRequest('Not found'))
    if (item.kind === 'log') return reply.code(400).send(badRequest('Add entries to a project in this log'))
    const [entry] = await db.insert(trackerEntries).values({ itemId: item.id, userId, date, note }).returning()
    return reply.code(201).send(serializeEntry(entry))
  })

  app.patch<{ Params: { id: string }; Body: { date?: unknown; note?: unknown } }>('/entries/:id', async (request, reply) => {
    const db = await database()
    const body = request.body ?? {}
    const changes: Partial<Entry> = {}
    if (body.date !== undefined) {
      const date = parseDate(body.date)
      if (!date) return reply.code(400).send(badRequest('A valid date is required'))
      changes.date = date
    }
    if (body.note !== undefined) {
      const note = typeof body.note === 'string' ? body.note.trim() : ''
      if (note.length > MAX_NOTE) return reply.code(400).send(badRequest(`Note is too long (max ${MAX_NOTE} characters)`))
      changes.note = note
    }
    if (Object.keys(changes).length === 0) return reply.code(400).send(badRequest('Nothing to change'))
    if (!UUID_RE.test(request.params.id)) return reply.code(404).send(badRequest('Not found'))
    const [entry] = await db
      .update(trackerEntries)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(trackerEntries.id, request.params.id), eq(trackerEntries.userId, member(request)), isNull(trackerEntries.deletedAt)))
      .returning()
    if (!entry) return reply.code(404).send(badRequest('Not found'))
    return serializeEntry(entry)
  })

  app.delete<{ Params: { id: string } }>('/entries/:id', async (request, reply) => {
    const db = await database()
    if (!UUID_RE.test(request.params.id)) return reply.code(404).send(badRequest('Not found'))
    const deleted = await db
      .update(trackerEntries)
      .set({ deletedAt: new Date() })
      .where(and(eq(trackerEntries.id, request.params.id), eq(trackerEntries.userId, member(request)), isNull(trackerEntries.deletedAt)))
      .returning({ id: trackerEntries.id })
    if (deleted.length === 0) return reply.code(404).send(badRequest('Not found'))
    return { id: request.params.id, deleted: true }
  })
}
