import { eq } from 'drizzle-orm'

import { signJson, verifyJson } from '../auth/tokens.js'
import { db } from '../db/client.js'
import { eventsLog, users } from '../db/schema.js'
import { requireEnv } from '../env.js'

interface UnsubscribeTokenPayload {
  kind: 'newsletter_unsubscribe'
  userId: string
}

// Reuses the same signJson/verifyJson HMAC envelope the WebAuthn ceremony
// uses for its challenge token (see auth/tokens.ts) rather than inventing
// new crypto. Unlike that challenge token, this one carries no issuedAt/TTL
// check — an unsubscribe link should stay valid indefinitely, not expire
// like a login challenge.
export function createUnsubscribeToken(userId: string): string {
  return signJson({ kind: 'newsletter_unsubscribe', userId } satisfies UnsubscribeTokenPayload, requireEnv('SESSION_SECRET'))
}

// Also called by send-weekly.ts (a non-HTTP standalone script) to mint each
// recipient's link, and by routes.ts's HTTP handler — kept here rather than
// in routes.ts so business logic stays out of the "HTTP surface" file, same
// split as auth/service.ts.
export async function unsubscribeFromNewsletter(token: string | undefined): Promise<'ok' | 'invalid'> {
  const payload = token ? verifyJson<UnsubscribeTokenPayload>(token, requireEnv('SESSION_SECRET')) : null
  if (!payload || payload.kind !== 'newsletter_unsubscribe') {
    return 'invalid'
  }

  await Promise.all([
    db.update(users).set({ newsletterSubscribed: false, updatedAt: new Date() }).where(eq(users.id, payload.userId)),
    db.insert(eventsLog).values({ actor: payload.userId, action: 'newsletter_unsubscribed', metadata: {} }),
  ])

  return 'ok'
}
