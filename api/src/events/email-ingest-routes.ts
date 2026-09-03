import type { FastifyInstance } from 'fastify'

import { processReceivedEmailById } from './email-ingest.js'
import { resendClient } from '../newsletter/mailer.js'

// Resend's `email.received` webhook (feedback #115) — the payload itself
// only carries metadata (from/subject/attachment info, never the body), so
// this fetches the full email separately via processReceivedEmailById()
// once the event_id is known. See CLAUDE.md's Events data model & sourcing
// section for the full setup (DNS, webhook creation) this depends on.
//
// Requires raw-body access to verify the signature (Resend/Svix signs the
// exact bytes sent, and Fastify's default JSON parser would otherwise
// consume and re-serialize the body before we ever see it) — scoped to just
// this route's own encapsulated plugin context via addContentTypeParser, so
// every other route in the app keeps normal automatic JSON parsing.
export async function emailIngestRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body)
  })

  app.post('/webhooks/resend', async (request, reply) => {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
    if (!webhookSecret) {
      // Deliberately lazy, not requireEnv-at-boot: this feature's DNS/
      // webhook setup happens after this code deploys (see CLAUDE.md), so
      // the whole server must still boot fine with this unset — it just
      // can't do anything useful yet.
      request.log.warn('RESEND_WEBHOOK_SECRET is not set — inbound email webhook is not configured')
      return reply.code(503).send({ error: { message: 'Inbound email webhook not configured' } })
    }

    const rawBody = request.body as string
    const svixId = request.headers['svix-id']
    const svixTimestamp = request.headers['svix-timestamp']
    const svixSignature = request.headers['svix-signature']
    if (typeof svixId !== 'string' || typeof svixTimestamp !== 'string' || typeof svixSignature !== 'string') {
      return reply.code(400).send({ error: { message: 'Missing webhook signature headers' } })
    }

    let event
    try {
      event = resendClient.webhooks.verify({
        payload: rawBody,
        headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
        webhookSecret,
      })
    } catch (err) {
      request.log.warn({ err }, 'Resend webhook signature verification failed')
      return reply.code(401).send({ error: { message: 'Invalid webhook signature' } })
    }

    // Always 200 once verified — Resend doesn't need to retry an event type
    // we don't act on, or a real email that just had no extractable events.
    if (event.type !== 'email.received') {
      return reply.code(200).send({ ok: true })
    }

    const result = await processReceivedEmailById(event.data.email_id).catch((err) => {
      request.log.error({ err }, 'Failed to process inbound email')
      return null
    })
    if (result) {
      request.log.info({ result }, 'Processed inbound email for event sourcing')
    }
    return reply.code(200).send({ ok: true })
  })
}
