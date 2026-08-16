import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { resolveSessionUser } from './service.js'

interface AuthedUser {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
  profileComplete: boolean
  friendsStepComplete: boolean
  role: string | null
  roleOther: string | null
  newsletterSubscribed: boolean
  roles: string[]
  // Carried straight through from the row this hook already fetched — lets
  // getUnseenFriendCount() (feedback #94) skip a second users lookup on
  // every GET /auth/me call rather than re-querying data already in hand.
  friendsSeenAt: Date | null
  // Same rationale as friendsSeenAt above, for getUnseenFeedbackReplyCount()
  // (feedback #98).
  feedbackRepliesSeenAt: Date | null
  createdAt: Date
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: AuthedUser | null
  }
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length)
}

export const authPlugin = fp(async (app) => {
  app.decorateRequest('currentUser', null)

  app.addHook('onRequest', async (request) => {
    const token = bearerToken(request)
    if (!token) return

    const resolved = await resolveSessionUser(token)
    if (!resolved) return

    request.currentUser = {
      id: resolved.user.id,
      name: resolved.user.name,
      email: resolved.user.email,
      avatarUrl: resolved.user.avatarUrl,
      profileComplete: resolved.user.profileCompletedAt !== null,
      friendsStepComplete: resolved.user.friendsStepCompletedAt !== null,
      role: resolved.user.role,
      roleOther: resolved.user.roleOther,
      newsletterSubscribed: resolved.user.newsletterSubscribed,
      roles: resolved.roles,
      friendsSeenAt: resolved.user.friendsSeenAt,
      feedbackRepliesSeenAt: resolved.user.feedbackRepliesSeenAt,
      createdAt: resolved.user.createdAt,
    }
  })
})

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.currentUser) {
    return reply.code(401).send({ error: { message: 'Login required' } })
  }
}

export function requireRole(role: string) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.currentUser?.roles.includes(role)) {
      return reply.code(403).send({ error: { message: 'Forbidden' } })
    }
  }
}
