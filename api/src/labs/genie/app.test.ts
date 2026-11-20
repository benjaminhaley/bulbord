import { afterEach, describe, expect, it, vi } from 'vitest'

import { extractPage, type GenieAgent } from './agent.js'
import { buildGenieApp } from './app.js'
import { bulbordMemberVerifier } from './members.js'
import { memoryStore } from './store.js'

const MEMBER = 'a3f1c2d4-0000-4000-8000-000000000001'
const tokens: Record<string, { id: string } | 'pending'> = { good: { id: MEMBER }, waiting: 'pending' }

function fakeAgent(overrides: Partial<GenieAgent> = {}): GenieAgent {
  return {
    gate: vi.fn(async ({ phrase }) => ({ request: phrase.toLowerCase().startsWith('show') ? phrase : null })),
    makePage: vi.fn(async ({ requests }) => ({ html: `<!doctype html><html><title>${requests[0]}</title></html>`, title: requests[0] })),
    ...overrides,
  }
}

let app: Awaited<ReturnType<typeof buildGenieApp>> | null = null
afterEach(async () => {
  await app?.close()
  app = null
})

async function build(agent = fakeAgent(), store = memoryStore()) {
  app = await buildGenieApp({
    agent,
    store,
    verifyMember: async (t) => tokens[t] ?? null,
    allowedOrigins: ['https://nettelhorst.bulbord.com'],
  })
  return app
}

const say = (token: string | null, body: object) =>
  app!.inject({ method: 'POST', url: '/say', headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body })

async function settled() {
  for (let i = 0; i < 20; i++) {
    const state = (await app!.inject({ method: 'GET', url: '/state' })).json().data
    if (!state.working) return state
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('still working')
}

describe('genie', () => {
  it('lets anyone watch, starting with no page', async () => {
    await build()
    const res = await app!.inject({ method: 'GET', url: '/state' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual({ page: null, working: null })
  })

  it('only lets approved members talk', async () => {
    await build()
    expect((await say(null, { text: 'show a cat' })).statusCode).toBe(401)
    expect((await say('nope', { text: 'show a cat' })).statusCode).toBe(401)
    const pending = await say('waiting', { text: 'show a cat' })
    expect(pending.statusCode).toBe(403)
    expect(pending.json().error.code).toBe('pending_approval')
  })

  it('ignores chatter: no page is made', async () => {
    const agent = fakeAgent()
    await build(agent)
    const res = await say('good', { text: 'did you feed the dog' })
    expect(res.json().data.request).toBeNull()
    expect(agent.makePage).not.toHaveBeenCalled()
  })

  it('makes a page for a request, and shows it to everyone', async () => {
    const agent = fakeAgent()
    await build(agent)
    const res = await say('good', { text: 'show me the weather' })
    expect(res.json().data.request).toBe('show me the weather')
    const state = await settled()
    expect(state.page.title).toBe('show me the weather')
    expect(state.page.html).toContain('<!doctype html>')
  })

  it('passes the current page along, so a request can change it', async () => {
    const agent = fakeAgent()
    await build(agent)
    await say('good', { text: 'show a maze game' })
    await settled()
    await say('good', { text: 'show it in purple' })
    await settled()
    expect(vi.mocked(agent.makePage).mock.calls[1][0].currentHtml).toContain('show a maze game')
  })

  it('skips the gate for typed requests', async () => {
    const agent = fakeAgent()
    await build(agent)
    const res = await say('good', { text: 'draw an elephant juggling', typed: true })
    expect(res.json().data.request).toBe('draw an elephant juggling')
    expect(agent.gate).not.toHaveBeenCalled()
  })

  it('gives the gate the phrases just heard, to join a split request', async () => {
    const agent = fakeAgent()
    await build(agent)
    await say('good', { text: 'hey genie I want to' })
    await say('good', { text: 'show pac-man' })
    expect(vi.mocked(agent.gate).mock.calls[1][0].recent).toEqual(['hey genie I want to'])
  })

  it('keeps the page when making a new one fails', async () => {
    let fail = false
    const agent = fakeAgent({
      makePage: vi.fn(async ({ requests }) => {
        if (fail) throw new Error('boom')
        return { html: '<!doctype html><html></html>', title: requests[0] }
      }),
    })
    await build(agent)
    await say('good', { text: 'show a cat' })
    await settled()
    fail = true
    await say('good', { text: 'show a dog' })
    expect((await settled()).page.title).toBe('show a cat')
  })

  it('limits how many requests one member can make', async () => {
    await build()
    const results = []
    for (let i = 0; i < 12; i++) results.push((await say('good', { text: `show thing ${i}`, typed: true })).statusCode)
    expect(results.filter((s) => s === 429).length).toBeGreaterThan(0)
  })

  it('rejects an empty phrase', async () => {
    await build()
    expect((await say('good', { text: '   ' })).statusCode).toBe(400)
  })
})

describe('extractPage', () => {
  it('pulls the document and title out of the answer', () => {
    const page = extractPage('Here you go:\n```html\n<!DOCTYPE html><html><head><title> Maze  Chase </title></head></html>\n```')
    expect(page).toEqual({ html: '<!DOCTYPE html><html><head><title> Maze  Chase </title></head></html>', title: 'Maze Chase' })
  })

  it('is null for NO_CHANGE', () => {
    expect(extractPage('NO_CHANGE')).toBeNull()
  })
})

describe('bulbordMemberVerifier', () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('accepts an approved member', async () => {
    const verify = bulbordMemberVerifier('http://api', reply(200, { data: { id: MEMBER, approved: true } }))
    expect(await verify('t')).toEqual({ id: MEMBER })
  })

  it('reports a pending account', async () => {
    const verify = bulbordMemberVerifier('http://api', reply(200, { data: { id: MEMBER, approved: false } }))
    expect(await verify('t')).toBe('pending')
  })

  it('rejects a bad token, and caches the answer', async () => {
    const fetchImpl = reply(401, {})
    const verify = bulbordMemberVerifier('http://api', fetchImpl)
    expect(await verify('t')).toBeNull()
    expect(await verify('t')).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('throws (uncached) when Bulbord is down', async () => {
    const verify = bulbordMemberVerifier('http://api', reply(502, {}))
    await expect(verify('t')).rejects.toThrow()
  })
})
