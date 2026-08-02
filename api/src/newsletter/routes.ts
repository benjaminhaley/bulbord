import type { FastifyInstance } from 'fastify'

import { unsubscribeFromNewsletter } from './service.js'

export async function newsletterRoutes(app: FastifyInstance) {
  // Public, no-login-required — the whole point of an email unsubscribe
  // link is that it works without asking the recipient to sign in first.
  app.get('/newsletter/unsubscribe', async (request, reply) => {
    const { token } = request.query as { token?: string }
    const result = await unsubscribeFromNewsletter(token)

    if (result === 'invalid') {
      return reply.code(400).type('text/html').send('<p>This unsubscribe link is invalid.</p>')
    }
    return reply.type('text/html').send("<p>You've been unsubscribed from the Nettlehorst weekly newsletter.</p>")
  })
}
