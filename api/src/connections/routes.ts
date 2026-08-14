import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import {
  addConnection,
  completeFriendsStep,
  getConnectionsState,
  getSuggestions,
  listOutgoingConnections,
  searchMembers,
} from './service.js'

export async function connectionsRoutes(app: FastifyInstance) {
  app.get('/connections', { preHandler: requireAuth }, async (request, reply) => {
    const data = await getConnectionsState(request.currentUser!.id)
    return reply.send({ data })
  })

  app.post('/connections', { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = (request.body ?? {}) as { userId?: string }
    if (!userId) {
      return reply.code(400).send({ error: { message: 'userId is required' } })
    }
    if (userId === request.currentUser!.id) {
      return reply.code(400).send({ error: { message: 'cannot add yourself as a connection' } })
    }
    const result = await addConnection(request.currentUser!.id, userId)
    return reply.send({ data: result })
  })

  app.get('/connections/suggestions', { preHandler: requireAuth }, async (request, reply) => {
    const data = await getSuggestions(request.currentUser!.id)
    return reply.send({ data })
  })

  app.get('/connections/of/:userId', { preHandler: requireAuth }, async (request, reply) => {
    // Powers "as you add potential friends, suggest their friends at the
    // bottom of the list" (feedback #83) — the client calls this for
    // whichever member was just added, to append their own connections to
    // the bottom of the onboarding suggestion list.
    const { userId } = request.params as { userId: string }
    const data = await listOutgoingConnections(userId)
    return reply.send({ data })
  })

  app.get('/connections/members', { preHandler: requireAuth }, async (request, reply) => {
    const { q } = request.query as { q?: string }
    const data = await searchMembers(request.currentUser!.id, q ?? '')
    return reply.send({ data })
  })

  app.post('/connections/finish-onboarding', { preHandler: requireAuth }, async (request, reply) => {
    await completeFriendsStep(request.currentUser!.id)
    return reply.send({ data: { friendsStepComplete: true } })
  })
}
