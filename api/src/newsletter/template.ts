import { buildInterestedTeaser, formatWhen, locationLabel, teaser } from './format.js'
import type { WeeklyEvent } from './query.js'
import { EVENT_CARD_SECONDARY_TEXT_COLOR as SECONDARY_TEXT_COLOR } from './theme.js'

export interface NewsletterRecipient {
  id: string
  name: string
}

// The when/location/description teaser don't depend on the recipient — only
// the "You" substitution in the interested-names line does. Precomputing
// these once per event (rather than inside eventRowHtml, which used to run
// once per event *per recipient*) avoids redoing the same formatting work
// N times for N recipients.
interface FormattedEvent {
  id: string
  title: string
  when: string
  location: string | null
  description: string | null
  thumbnailUrl: string | null
  interestedCount: number
  interestedNames: WeeklyEvent['interestedNames']
}

export function formatWeeklyEvents(events: WeeklyEvent[]): FormattedEvent[] {
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    when: formatWhen(event),
    location: locationLabel(event),
    description: teaser(event.description),
    thumbnailUrl: event.thumbnailUrl,
    interestedCount: event.interestedCount,
    interestedNames: event.interestedNames,
  }))
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Field order mirrors the in-app event card (web/src/events/EventsPage.tsx):
// thumbnail, title, when, location, description teaser, interested-count
// line. Table-based layout with inline styles throughout — standard for
// email-client HTML rendering, which doesn't support external stylesheets
// or most modern CSS. The whole row is one anchor (rather than just the
// title, as before) to match the app's IonItem, where tapping anywhere on
// the row — not just the title text — opens the event.
function eventRowHtml(event: FormattedEvent, recipient: NewsletterRecipient, apiUrl: string, webUrl: string): string {
  const names = event.interestedNames.map((person) => (person.id === recipient.id ? 'You' : person.name))
  const interestedLine = event.interestedCount > 0 ? buildInterestedTeaser(names, event.interestedCount) : null
  const thumb = event.thumbnailUrl
    ? `<img src="${apiUrl}${event.thumbnailUrl}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:8px;" alt="" />`
    : ''

  return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #e5e5e5;">
        <a href="${webUrl}/events/${event.id}" style="display:block;text-decoration:none;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${thumb ? `<td width="64" valign="top" style="padding-right:12px;">${thumb}</td>` : ''}
              <td valign="top">
                <div style="font-size:16px;font-weight:600;color:#111111;">${escapeHtml(event.title)}</div>
                <div style="color:${SECONDARY_TEXT_COLOR};font-size:14px;margin-top:2px;">${escapeHtml(event.when)}</div>
                ${event.location ? `<div style="color:${SECONDARY_TEXT_COLOR};font-size:13px;margin-top:2px;">${escapeHtml(event.location)}</div>` : ''}
                ${event.description ? `<div style="color:${SECONDARY_TEXT_COLOR};font-size:14px;margin-top:6px;">${escapeHtml(event.description)}</div>` : ''}
                ${interestedLine ? `<div style="color:${SECONDARY_TEXT_COLOR};font-size:13px;margin-top:6px;">${escapeHtml(interestedLine)}</div>` : ''}
              </td>
            </tr>
          </table>
        </a>
      </td>
    </tr>`
}

// Shared by the real weekly send (send-weekly.ts) and the admin "send
// yourself a test email" dev tool (service.ts's sendTestNewsletterEmail) —
// one place for the subject line so a test send's subject can't drift from
// what members actually receive (feedback #38, and the same drift concern
// feedback #36 raised about the HTML template itself).
export function newsletterSubject(eventCount: number, prefix = ''): string {
  return `${prefix}This week near Nettelhorst: ${eventCount} event${eventCount === 1 ? '' : 's'}`
}

export function renderNewsletterHtml(options: {
  events: FormattedEvent[]
  recipient: NewsletterRecipient
  apiUrl: string
  webUrl: string
  unsubscribeUrl: string
}): string {
  const { events, recipient, apiUrl, webUrl, unsubscribeUrl } = options
  const rows = events.map((event) => eventRowHtml(event, recipient, apiUrl, webUrl)).join('')
  const body =
    events.length === 0
      ? `<tr><td style="padding:8px 24px 24px;color:#666666;font-size:14px;">No events found for this week yet — check back on the app.</td></tr>`
      : `<tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#2c2c2c;padding:14px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:10px;"><img src="${webUrl}/nettelhorst-logo.png" width="28" height="28" style="display:block;width:28px;height:28px;object-fit:contain;" alt="" /></td>
                    <td style="font-size:16px;font-weight:600;color:#ffffff;">Nettelhorst</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px;">
                <h1 style="font-size:20px;margin:0 0 4px;color:#111111;">This week near Nettelhorst</h1>
                <p style="color:#666666;font-size:14px;margin:0;">Hi ${escapeHtml(recipient.name)}, here's what's coming up.</p>
              </td>
            </tr>
            ${body}
            <tr>
              <td style="padding:24px;text-align:center;">
                <a href="${webUrl}/events" style="display:inline-block;background:#111111;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">See more</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;text-align:center;color:#999999;font-size:12px;">
                <a href="${unsubscribeUrl}" style="color:#999999;">Unsubscribe from this weekly email</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
