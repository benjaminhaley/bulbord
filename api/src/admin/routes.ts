import type { FastifyInstance } from 'fastify'

import { requireRole } from '../auth/plugin.js'
import { listUsersForAdmin } from '../auth/service.js'

// First admin view in the app (see CLAUDE.md's Introspectability section) —
// everyone else so far has been ad-hoc per-feature admin gating, not a
// dedicated section. Grows here rather than each feature inventing its own.
export async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/users', { preHandler: requireRole('admin') }, async (_request, reply) => {
    const rows = await listUsersForAdmin()
    return reply.send({
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        avatar_url: row.avatarUrl,
        created_at: row.createdAt,
        invited_by_name: row.invitedByName,
      })),
      has_more: false,
      next_cursor: null,
    })
  })
}
