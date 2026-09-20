import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./service.js', () => ({ resolveSessionUser: vi.fn() }))

const { requireAuth, requireSession } = await import('./plugin.js')

function fakeReply() {
  const reply = { code: vi.fn(), send: vi.fn() }
  reply.code.mockReturnValue(reply)
  reply.send.mockReturnValue(reply)
  return reply
}
const asRequest = (r: object) => r as unknown as FastifyRequest
const asReply = (r: object) => r as unknown as FastifyReply

// Feedback #175: open signup with admin approval. An account that has
// signed up but isn't approved has a session (requireSession passes) but is
// not a member (requireAuth rejects it, distinctly from "not logged in").
describe('requireAuth / requireSession', () => {
  it('lets an approved member through', async () => {
    const reply = fakeReply()
    await requireAuth(asRequest({ currentUser: { id: 'u1' }, sessionUser: { id: 'u1' } }), asReply(reply))
    expect(reply.code).not.toHaveBeenCalled()
  })

  it('rejects an anonymous request with 401', async () => {
    const reply = fakeReply()
    await requireAuth(asRequest({ currentUser: null, sessionUser: null }), asReply(reply))
    expect(reply.code).toHaveBeenCalledWith(401)
  })

  it('rejects a pending account with 403 pending_approval', async () => {
    const reply = fakeReply()
    await requireAuth(asRequest({ currentUser: null, sessionUser: { id: 'u9' } }), asReply(reply))
    expect(reply.code).toHaveBeenCalledWith(403)
    expect(reply.send).toHaveBeenCalledWith({ error: { message: expect.any(String), code: 'pending_approval' } })
  })

  it('requireSession accepts a pending account but not an anonymous one', async () => {
    const ok = fakeReply()
    await requireSession(asRequest({ sessionUser: { id: 'u9' } }), asReply(ok))
    expect(ok.code).not.toHaveBeenCalled()

    const denied = fakeReply()
    await requireSession(asRequest({ sessionUser: null }), asReply(denied))
    expect(denied.code).toHaveBeenCalledWith(401)
  })
})
