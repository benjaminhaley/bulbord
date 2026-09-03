import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import {
  acceptConnection,
  completeFriendsStep,
  declineConnection,
  getConnectionsState,
  getSuggestions,
  listAcceptedConnections,
  requestConnection,
  searchMembers,
} from './service.js'

export async function connectionsRoutes(app: FastifyInstance) {
  app.get('/connections', { preHandler: requireAuth }, async (request, reply) => {
    const data = await getConnectionsState(request.currentUser!.id)
    return reply.send({ data })
  })

  // Sends a friend request (feedback #127) — instant/no-approval was the
  // original 2026-08-14 design; this reverses it. See requestConnection's
  // own comment for what happens if the target already requested you.
  app.post('/connections', { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = (request.body ?? {}) as { userId?: string }
    if (!userId) {
      return reply.code(400).send({ error: { message: 'userId is required' } })
    }
    if (userId === request.currentUser!.id) {
      return reply.code(400).send({ error: { message: 'cannot add yourself as a connection' } })
    }
    const result = await requestConnection(request.currentUser!.id, userId)
    return reply.send({ data: result })
  })

  app.post('/connections/:id/accept', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const accepted = await acceptConnection(request.currentUser!.id, id)
    if (!accepted) {
      return reply.code(404).send({ error: { message: 'Friend request not found' } })
    }
    return reply.send({ data: { accepted: true } })
  })

  app.post('/connections/:id/decline', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const declined = await declineConnection(request.currentUser!.id, id)
    if (!declined) {
      return reply.code(404).send({ error: { message: 'Friend request not found' } })
    }
    return reply.send({ data: { declined: true } })
  })

  app.get('/connections/suggestions', { preHandler: requireAuth }, async (request, reply) => {
    const data = await getSuggestions(request.currentUser!.id)
    return reply.send({ data })
  })

  app.get('/connections/of/:userId', { preHandler: requireAuth }, async (request, reply) => {
    // Powers "as you add potential friends, suggest their friends at the
    // bottom of the list" (feedback #83) — the client calls this for
    // whichever member was just added, to append their own real (accepted)
    // friends to the bottom of the onboarding suggestion list.
    const { userId } = request.params as { userId: string }
    const data = await listAcceptedConnections(userId)
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
