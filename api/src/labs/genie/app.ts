import cors from '@fastify/cors'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'

import type { GenieAgent } from './agent.js'
import type { VerifyMember } from './members.js'
import type { GeniePage, GenieStore } from './store.js'

// Genie (Labs, feedback #192): one shared page that everyone watching sees,
// changed by what members say near it. Runs as its own Railway service
// (server.ts), so nothing here can affect Bulbord.
//
//   GET  /state   the current page and what Genie is working on (public)
//   GET  /stream  the same, pushed as server-sent events (public)
//   POST /say     a member's phrase: {text, typed?} with their Bulbord token
//
// A heard phrase goes through the gate (is it a request?); a typed one is
// always a request. Requests queue up and are made one batch at a time, each
// batch being every request that arrived while the last one was being made.

export interface GenieDeps {
  agent: GenieAgent
  store: GenieStore
  verifyMember: VerifyMember
  allowedOrigins: string[]
  logger?: boolean
  now?: () => number
}

const MAX_PHRASE = 500
const RECENT_MS = 30_000
const RECENT_KEEP = 4
const MAX_PENDING = 6
// Limits, so an always-on mic can't run up a bill.
const PHRASES_PER_MINUTE = 30 // per member, gate calls
const REQUESTS_PER_10_MIN = 10 // per member, requests that reach the genie
const PAGES_PER_HOUR = 60 // everyone together
const PROGRESS_EVERY_MS = 1500

interface Working {
  requests: string[]
  startedAt: string
  chars: number
}

type Event = { type: 'page'; page: GeniePage | null } | { type: 'working'; working: Working | null } | { type: 'notice'; message: string }

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
  }
}

// Times of recent events per key, for "at most N in the last W ms".
function windowLimiter(limit: number, windowMs: number, now: () => number) {
  const hits = new Map<string, number[]>()
  return (key: string) => {
    const t = now()
    const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs)
    if (recent.length >= limit) {
      hits.set(key, recent)
      return false
    }
    recent.push(t)
    hits.set(key, recent)
    return true
  }
}

export async function buildGenieApp(deps: GenieDeps) {
  const now = deps.now ?? Date.now
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 16 * 1024 })
  const originAllowed = (origin: string | undefined) => !origin || deps.allowedOrigins.includes(origin)
  await app.register(cors, { origin: (origin, cb) => cb(null, originAllowed(origin)) })

  const phraseLimit = windowLimiter(PHRASES_PER_MINUTE, 60_000, now)
  const requestLimit = windowLimiter(REQUESTS_PER_10_MIN, 10 * 60_000, now)
  const pageLimit = windowLimiter(PAGES_PER_HOUR, 60 * 60_000, now)

  // Phrases each member's mic heard in the last few seconds, in memory only,
  // so the gate can join a request split across pauses.
  const recent = new Map<string, { text: string; at: number }[]>()
  let page: GeniePage | null | undefined // undefined = not loaded yet
  let working: Working | null = null
  let pending: { text: string; memberId: string }[] = []
  const clients = new Set<FastifyReply['raw']>()

  async function currentPage() {
    if (page === undefined) page = await deps.store.currentPage()
    return page
  }

  function broadcast(event: Event) {
    const data = `data: ${JSON.stringify(event)}\n\n`
    for (const raw of clients) raw.write(data)
  }

  async function runQueue() {
    if (working || pending.length === 0) return
    const batch = pending
    pending = []
    const requests = batch.map((b) => b.text)
    if (!pageLimit('all')) {
      broadcast({ type: 'notice', message: 'Genie needs a short rest. Try again in a few minutes.' })
      await Promise.all(batch.map((b) => deps.store.logRequest({ memberId: b.memberId, text: b.text, outcome: 'rate_limited' }).catch(() => {})))
      return
    }
    working = { requests, startedAt: new Date(now()).toISOString(), chars: 0 }
    broadcast({ type: 'working', working })
    let lastProgress = 0
    let outcome = 'failed'
    try {
      const current = await currentPage()
      const made = await deps.agent.makePage({ requests, currentHtml: current?.html ?? null }, (chars) => {
        if (!working) return
        working.chars = chars
        if (now() - lastProgress >= PROGRESS_EVERY_MS) {
          lastProgress = now()
          broadcast({ type: 'working', working })
        }
      })
      if (made) {
        page = await deps.store.savePage({ ...made, request: requests.join(' / '), memberIds: [...new Set(batch.map((b) => b.memberId))] })
        broadcast({ type: 'page', page })
        outcome = 'page'
      } else {
        outcome = 'no_change'
        broadcast({ type: 'notice', message: `Genie left the page as it is (“${requests.at(-1)}”).` })
      }
    } catch (err) {
      app.log.error({ err }, 'genie: making the page failed')
      broadcast({ type: 'notice', message: `Genie couldn't do that one (“${requests.at(-1)}”). Try saying it another way.` })
    } finally {
      working = null
      broadcast({ type: 'working', working: null })
      await Promise.all(batch.map((b) => deps.store.logRequest({ memberId: b.memberId, text: b.text, outcome }).catch(() => {})))
      void runQueue()
    }
  }

  async function requireMember(request: FastifyRequest) {
    const header = request.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) throw new HttpError(401, 'Sign in to talk to Genie', 'login_required')
    const member = await deps.verifyMember(token)
    if (member === 'pending') throw new HttpError(403, 'Your account is waiting for approval', 'pending_approval')
    if (!member) throw new HttpError(401, 'Sign in to talk to Genie', 'login_required')
    return member
  }

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: { message: err.message, code: err.code } })
    const status = (err as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.code(status).send({ error: { message: (err as Error).message } })
    app.log.error({ err }, 'genie: request failed')
    return reply.code(500).send({ error: { message: 'Something went wrong' } })
  })

  app.get('/health', async () => ({ ok: true }))

  app.get('/state', async () => ({ data: { page: await currentPage(), working } }))

  app.get('/stream', async (request, reply) => {
    const origin = request.headers.origin
    if (!originAllowed(origin)) return reply.code(403).send({ error: { message: 'Origin not allowed' } })
    const current = await currentPage()
    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    })
    raw.write(`retry: 3000\n\n`)
    raw.write(`data: ${JSON.stringify({ type: 'page', page: current } satisfies Event)}\n\n`)
    raw.write(`data: ${JSON.stringify({ type: 'working', working } satisfies Event)}\n\n`)
    clients.add(raw)
    const ping = setInterval(() => raw.write(`: ping\n\n`), 25_000)
    request.raw.on('close', () => {
      clearInterval(ping)
      clients.delete(raw)
    })
  })

  app.post('/say', async (request) => {
    const member = await requireMember(request)
    const body = (request.body ?? {}) as { text?: unknown; typed?: unknown }
    const phrase = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, MAX_PHRASE) : ''
    if (!phrase) throw new HttpError(400, 'Say something first')
    if (!phraseLimit(member.id)) throw new HttpError(429, 'Genie is hearing a lot from you. Give it a moment.', 'rate_limited')

    let requestText: string | null = phrase
    if (body.typed !== true) {
      const t = now()
      const mine = (recent.get(member.id) ?? []).filter((r) => t - r.at < RECENT_MS)
      const showing = (await currentPage())?.title ?? ''
      const gate = await deps.agent.gate({ phrase, recent: mine.map((r) => r.text), showing })
      requestText = gate.request
      // A phrase that completed a request is used up; otherwise keep it as context.
      recent.set(member.id, requestText ? [] : [...mine, { text: phrase, at: t }].slice(-RECENT_KEEP))
    }
    if (!requestText) return { data: { request: null } }

    if (!requestLimit(member.id)) throw new HttpError(429, 'That’s a lot of wishes. Give Genie a few minutes.', 'rate_limited')
    if (pending.length >= MAX_PENDING) throw new HttpError(429, 'Genie already has a lot to do. Try again in a moment.', 'busy')
    pending.push({ text: requestText, memberId: member.id })
    void runQueue()
    return { data: { request: requestText } }
  })

  app.addHook('onClose', async () => {
    for (const raw of clients) raw.end()
    clients.clear()
  })

  return app
}
