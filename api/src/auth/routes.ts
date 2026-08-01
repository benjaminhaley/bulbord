import type { FastifyInstance, FastifyReply } from 'fastify'

import { bearerToken, requireAuth } from './plugin.js'
import { getPublicInviteInfo, revokeSession, updateProfile } from './service.js'
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from './webauthn.js'

type VerifyResult = { ok: true; token: string } | { ok: false; message: string }

// Shared by /register/verify and /login/verify below — same request shape
// (an opaque `response` plus the `challengeToken` from the matching /options
// call) and same response shaping, only the verify function itself differs.
async function handleVerify<T extends { response: never; challengeToken: string }>(
  reply: FastifyReply,
  body: unknown,
  verify: (input: T) => Promise<VerifyResult>,
) {
  const { response, challengeToken } = (body ?? {}) as { response?: unknown; challengeToken?: string }
  if (!response || !challengeToken) {
    return reply.code(400).send({ error: { message: 'response and challengeToken are required' } })
  }

  const result = await verify({ response, challengeToken } as T)
  if (!result.ok) {
    return reply.code(400).send({ error: { message: result.message } })
  }
  return reply.send({ data: { token: result.token } })
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/webauthn/register/options', async (request, reply) => {
    const body = request.body as { inviterUserId?: string; rootSecret?: string }
    const result = await createRegistrationOptions(body)
    if (!result.ok) {
      return reply.code(403).send({ error: { message: result.message } })
    }
    return reply.send({ data: { options: result.options, challengeToken: result.challengeToken } })
  })

  app.post('/auth/webauthn/register/verify', (request, reply) => handleVerify(reply, request.body, verifyRegistration))

  app.post('/auth/webauthn/login/options', async (_request, reply) => {
    const { options, challengeToken } = await createAuthenticationOptions()
    return reply.send({ data: { options, challengeToken } })
  })

  app.post('/auth/webauthn/login/verify', (request, reply) => handleVerify(reply, request.body, verifyAuthentication))

  app.get('/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.currentUser!
    return reply.send({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        profileComplete: user.profileComplete,
        roles: user.roles,
      },
    })
  })

  app.patch('/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { name?: string; avatarUrl?: string }
    const name = body.name?.trim()
    if (body.name !== undefined && !name) {
      return reply.code(400).send({ error: { message: 'name cannot be blank' } })
    }

    const updated = await updateProfile(request.currentUser!.id, { name, avatarUrl: body.avatarUrl })
    return reply.send({
      data: {
        id: updated.id,
        name: updated.name,
        avatarUrl: updated.avatarUrl,
        profileComplete: updated.profileCompletedAt !== null,
      },
    })
  })

  app.post('/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    await revokeSession(bearerToken(request)!)
    return reply.code(204).send()
  })

  // Public — powers the "Sam Rivera invited you" copy on the join screen for
  // a not-yet-a-member visitor. Returns name/photo only (see CLAUDE.md's Data
  // safety rules on public PII exposure).
  app.get('/invites/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const info = await getPublicInviteInfo(userId)
    if (!info) {
      return reply.code(404).send({ error: { message: 'Invite not found' } })
    }
    return reply.send({ data: info })
  })
}
