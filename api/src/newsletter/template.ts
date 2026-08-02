import { buildInterestedTeaser, formatWhen, locationLabel, teaser } from './format.js'
import type { WeeklyEvent } from './query.js'

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
// or most modern CSS.
function eventRowHtml(event: FormattedEvent, recipient: NewsletterRecipient, apiUrl: string, webUrl: string): string {
  const names = event.interestedNames.map((person) => (person.id === recipient.id ? 'You' : person.name))
  const interestedLine = event.interestedCount > 0 ? buildInterestedTeaser(names, event.interestedCount) : null
  const thumb = event.thumbnailUrl
    ? `<img src="${apiUrl}${event.thumbnailUrl}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:8px;" alt="" />`
    : ''

  return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #e5e5e5;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            ${thumb ? `<td width="64" valign="top" style="padding-right:12px;">${thumb}</td>` : ''}
            <td valign="top">
              <a href="${webUrl}/events/${event.id}" style="font-size:16px;font-weight:600;color:#111111;text-decoration:none;">${escapeHtml(event.title)}</a>
              <div style="color:#555555;font-size:14px;margin-top:2px;">${escapeHtml(event.when)}</div>
              ${event.location ? `<div style="color:#888888;font-size:13px;margin-top:2px;">${escapeHtml(event.location)}</div>` : ''}
              ${event.description ? `<div style="color:#333333;font-size:14px;margin-top:6px;">${escapeHtml(event.description)}</div>` : ''}
              ${interestedLine ? `<div style="color:#0a7a4d;font-size:13px;margin-top:6px;">${escapeHtml(interestedLine)}</div>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>`
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
              <td style="padding:24px 24px 8px;">
                <h1 style="font-size:20px;margin:0 0 4px;color:#111111;">This week on Campy</h1>
                <p style="color:#666666;font-size:14px;margin:0;">Hi ${escapeHtml(recipient.name)}, here's what's coming up.</p>
              </td>
            </tr>
            ${body}
            <tr>
              <td style="padding:24px;text-align:center;">
                <a href="${webUrl}/events" style="display:inline-block;background:#111111;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">Open Campy</a>
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
