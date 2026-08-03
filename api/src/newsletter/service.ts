import { eq } from 'drizzle-orm'

import { signJson, verifyJson } from '../auth/tokens.js'
import { db } from '../db/client.js'
import { eventsLog, users } from '../db/schema.js'
import { requireEnv } from '../env.js'
import { sendNewsletterEmail } from './mailer.js'
import { getWeeklyEvents } from './query.js'
import { formatWeeklyEvents, newsletterSubject, renderNewsletterHtml } from './template.js'
import { getUpcomingWeekRange } from './week.js'

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

// Admin dev tool (feedback #38): renders and sends this week's newsletter to
// the requesting admin's own address only, using the same query/template/
// mailer path as the real weekly send (send-weekly.ts) — so a "does this
// look right" test actually reflects what a member would get, rather than a
// separately-maintained preview that could drift. Uses the admin's own real
// unsubscribe token, same as any recipient would get, rather than faking one.
export async function sendTestNewsletterEmail(recipient: { id: string; name: string; email: string }): Promise<void> {
  const { monday, sunday } = getUpcomingWeekRange()
  const events = formatWeeklyEvents(await getWeeklyEvents(monday, sunday))
  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')

  const html = renderNewsletterHtml({
    events,
    recipient: { id: recipient.id, name: recipient.name },
    apiUrl,
    webUrl,
    unsubscribeUrl: `${apiUrl}/newsletter/unsubscribe?token=${createUnsubscribeToken(recipient.id)}`,
  })

  await sendNewsletterEmail(recipient.email, newsletterSubject(events.length, '[Test] '), html)
}
