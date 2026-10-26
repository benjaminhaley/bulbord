import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'

import { requireAuth } from '../../auth/plugin.js'
import { trackerDb, trackerEntries, trackerItems } from './db.js'

// "Next time it'll happen" tracker (Labs). Each member has their own private
// list of items; an entry is a date + short note, and an item's current state
// is simply its most recently added entry (the page decides red/blank vs.
// upcoming from that). Entries are append-only + soft-delete, which doubles
// as this lab's own history — labs never write to the app's events_log.
const DEFAULT_ITEMS = ['Date with Anna', 'Playdate for Sebrin', 'Fun trip', 'Hang with a friend']
const MAX_NAME = 80
const MAX_NOTE = 200
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function badRequest(message: string) {
  return { error: { message } }
}

export const trackerLab: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get('/items', async (request) => {
    const db = await trackerDb()
    const userId = request.currentUser!.id

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
          .orderBy(desc(trackerEntries.createdAt))
      : []

    return {
      data: items.map((item) => {
        const latest = entries.find((e) => e.itemId === item.id)
        return {
          id: item.id,
          name: item.name,
          latest: latest ? { id: latest.id, date: latest.date, note: latest.note, created_at: latest.createdAt } : null,
        }
      }),
    }
  })

  app.post<{ Body: { name?: unknown } }>('/items', async (request, reply) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
    if (!name || name.length > MAX_NAME) return reply.code(400).send(badRequest(`Name is required (max ${MAX_NAME} characters)`))
    const db = await trackerDb()
    const userId = request.currentUser!.id
    const existing = await db.select({ position: trackerItems.position }).from(trackerItems).where(eq(trackerItems.userId, userId))
    const position = existing.reduce((max, r) => Math.max(max, r.position + 1), 0)
    const [item] = await db.insert(trackerItems).values({ userId, name, position }).returning()
    return reply.code(201).send({ id: item.id, name: item.name, latest: null })
  })

  app.patch<{ Params: { id: string }; Body: { name?: unknown } }>('/items/:id', async (request, reply) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
    if (!name || name.length > MAX_NAME) return reply.code(400).send(badRequest(`Name is required (max ${MAX_NAME} characters)`))
    const db = await trackerDb()
    const updated = await db
      .update(trackerItems)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(trackerItems.id, request.params.id), eq(trackerItems.userId, request.currentUser!.id), isNull(trackerItems.deletedAt)))
      .returning({ id: trackerItems.id })
    if (updated.length === 0) return reply.code(404).send(badRequest('Not found'))
    return { id: request.params.id, name }
  })

  app.delete<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const db = await trackerDb()
    const deleted = await db
      .update(trackerItems)
      .set({ deletedAt: new Date() })
      .where(and(eq(trackerItems.id, request.params.id), eq(trackerItems.userId, request.currentUser!.id), isNull(trackerItems.deletedAt)))
      .returning({ id: trackerItems.id })
    if (deleted.length === 0) return reply.code(404).send(badRequest('Not found'))
    return { id: request.params.id, deleted: true }
  })

  app.post<{ Params: { id: string }; Body: { date?: unknown; note?: unknown } }>('/items/:id/entries', async (request, reply) => {
    const date = typeof request.body?.date === 'string' ? request.body.date : ''
    const note = typeof request.body?.note === 'string' ? request.body.note.trim() : ''
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) return reply.code(400).send(badRequest('A valid date is required'))
    if (note.length > MAX_NOTE) return reply.code(400).send(badRequest(`Note is too long (max ${MAX_NOTE} characters)`))
    const db = await trackerDb()
    const userId = request.currentUser!.id
    const [item] = await db
      .select({ id: trackerItems.id })
      .from(trackerItems)
      .where(and(eq(trackerItems.id, request.params.id), eq(trackerItems.userId, userId), isNull(trackerItems.deletedAt)))
    if (!item) return reply.code(404).send(badRequest('Not found'))
    const [entry] = await db.insert(trackerEntries).values({ itemId: item.id, userId, date, note }).returning()
    return reply.code(201).send({ id: entry.id, date: entry.date, note: entry.note, created_at: entry.createdAt })
  })

  app.delete<{ Params: { id: string } }>('/entries/:id', async (request, reply) => {
    const db = await trackerDb()
    const deleted = await db
      .update(trackerEntries)
      .set({ deletedAt: new Date() })
      .where(and(eq(trackerEntries.id, request.params.id), eq(trackerEntries.userId, request.currentUser!.id), isNull(trackerEntries.deletedAt)))
      .returning({ id: trackerEntries.id })
    if (deleted.length === 0) return reply.code(404).send(badRequest('Not found'))
    return { id: request.params.id, deleted: true }
  })
}
