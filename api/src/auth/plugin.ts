import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { resolveSessionUser } from './service.js'

export interface AuthedUser {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
  profileComplete: boolean
  roles: string[]
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
      roles: resolved.roles,
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
