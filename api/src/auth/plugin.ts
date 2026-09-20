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
  createdAt: Date
  approved: boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    // The approved member behind this request's bearer token, or null —
    // deliberately null for a signed-up-but-pending account too, so a public
    // (optional-auth) route treats a pending account exactly like an
    // anonymous visitor (feedback #175).
    currentUser: AuthedUser | null
    // Any valid session, approved or pending. Only the handful of routes a
    // pending account legitimately needs (profile setup, its own photo
    // upload, /auth/me, logout) read this, via requireSession.
    sessionUser: AuthedUser | null
  }
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length)
}

export const authPlugin = fp(async (app) => {
  app.decorateRequest('currentUser', null)
  app.decorateRequest('sessionUser', null)

  app.addHook('onRequest', async (request) => {
    const token = bearerToken(request)
    if (!token) return

    const resolved = await resolveSessionUser(token)
    if (!resolved) return

    const authed: AuthedUser = {
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
      createdAt: resolved.user.createdAt,
      approved: resolved.user.approvedAt !== null,
    }
    request.sessionUser = authed
    if (authed.approved) request.currentUser = authed
  })
})

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.currentUser) {
    if (request.sessionUser) {
      return reply.code(403).send({ error: { message: 'Your account is waiting for approval', code: 'pending_approval' } })
    }
    return reply.code(401).send({ error: { message: 'Login required' } })
  }
}

// Any signed-in account, approved or not — for the routes a brand-new
// pending member needs to finish signing up (feedback #175).
export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  if (!request.sessionUser) {
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
