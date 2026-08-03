import type { FastifyInstance } from 'fastify'

import { requireRole } from '../auth/plugin.js'
import { listUsersForAdmin } from '../auth/service.js'
import { sendTestNewsletterEmail } from '../newsletter/service.js'

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
        newsletter_subscribed: row.newsletterSubscribed,
      })),
      has_more: false,
      next_cursor: null,
    })
  })

  // Dev tool (feedback #38): lets an admin see a live newsletter render
  // without waiting for the Sunday cron or affecting any other recipient.
  app.post('/admin/newsletter/test-send', { preHandler: requireRole('admin') }, async (request, reply) => {
    const user = request.currentUser!
    if (!user.email) {
      return reply.code(400).send({ error: { message: 'Your account has no email on file' } })
    }
    await sendTestNewsletterEmail({ id: user.id, name: user.name, email: user.email })
    return reply.send({ sent: true })
  })
}
