import {
  bookingStatusChipStyle,
  bookingStatusLabel,
  buildInterestedTeaser,
  campDetailsLine,
  distanceLabel,
  formatDateRange,
  locationLabel,
  timeLabel,
} from '../camps/format.js'
import type { ReminderCamp } from './query.js'
import { EVENT_CARD_SECONDARY_TEXT_COLOR as SECONDARY_TEXT_COLOR } from '../newsletter/theme.js'

export interface ReminderRecipient {
  id: string
  name: string
}

// The date/time/booking/location/details lines don't depend on the
// recipient — only the "You" substitution in the interested-names line
// does. Precomputed once per camp (not once per camp per recipient), same
// split as newsletter/template.ts's FormattedEvent.
interface FormattedCamp {
  id: string
  title: string
  dateRange: string
  time: string
  bookingLabel: string
  bookingChip: { background: string; color: string }
  location: string | null
  details: string
  thumbnailUrl: string | null
  interestedCount: number
  interestedNames: ReminderCamp['interestedNames']
}

export function formatReminderCamps(camps: ReminderCamp[]): FormattedCamp[] {
  return camps.map((camp) => ({
    id: camp.id,
    title: camp.title,
    dateRange: formatDateRange(camp.startDate, camp.endDate),
    time: timeLabel(camp.startTime, camp.endTime),
    bookingLabel: bookingStatusLabel(camp.bookingStatus),
    bookingChip: bookingStatusChipStyle(camp.bookingStatus),
    location: (() => {
      const label = locationLabel({ locationName: camp.locationName, address: camp.address })
      const distance = distanceLabel(camp.distanceMiles)
      return label ? `${label} · ${distance}` : null
    })(),
    details: campDetailsLine({
      price_per_day: camp.pricePerDay,
      price_is_estimated: camp.priceIsEstimated,
      age_min: camp.ageMin,
      age_max: camp.ageMax,
      spots_available: camp.spotsAvailable,
    }),
    thumbnailUrl: camp.thumbnailUrl,
    interestedCount: camp.interestedCount,
    interestedNames: camp.interestedNames,
  }))
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Field order mirrors the in-app compact camp row (web/src/camps/
// CampsPage.tsx's CampRow — feedback #120: "render them very closely to how
// they rendered on the site"): thumbnail, title, date, time, booking-status
// badge, location/distance, price/age/spots line, interested-count line.
// Table-based layout with inline styles, same email-client-compatibility
// posture as newsletter/template.ts's eventRowHtml, which this otherwise
// mirrors closely.
function campRowHtml(camp: FormattedCamp, recipient: ReminderRecipient, apiUrl: string, webUrl: string): string {
  const names = camp.interestedNames.map((person) => (person.id === recipient.id ? 'You' : person.name))
  const interestedLine = camp.interestedCount > 0 ? buildInterestedTeaser(names, camp.interestedCount) : null
  const thumb = camp.thumbnailUrl
    ? `<img src="${apiUrl}${camp.thumbnailUrl}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:8px;" alt="" />`
    : ''

  return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #e5e5e5;">
        <a href="${webUrl}/camps/${camp.id}" style="display:block;text-decoration:none;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${thumb ? `<td width="64" valign="top" style="padding-right:12px;">${thumb}</td>` : ''}
              <td valign="top">
                <div style="font-size:16px;font-weight:600;color:#111111;">${escapeHtml(camp.title)}</div>
                <div style="color:${SECONDARY_TEXT_COLOR};font-size:14px;margin-top:2px;">${escapeHtml(camp.dateRange)}</div>
                <div style="color:${SECONDARY_TEXT_COLOR};font-size:14px;margin-top:2px;">${escapeHtml(camp.time)}</div>
                <div style="margin-top:4px;">
                  <span style="display:inline-block;background:${camp.bookingChip.background};color:${camp.bookingChip.color};font-size:12px;font-weight:500;padding:2px 8px;border-radius:10px;">${escapeHtml(camp.bookingLabel)}</span>
                </div>
                ${camp.location ? `<div style="color:${SECONDARY_TEXT_COLOR};font-size:13px;margin-top:4px;">${escapeHtml(camp.location)}</div>` : ''}
                <div style="color:${SECONDARY_TEXT_COLOR};font-size:13px;margin-top:2px;">${escapeHtml(camp.details)}</div>
                ${interestedLine ? `<div style="color:${SECONDARY_TEXT_COLOR};font-size:13px;margin-top:6px;">${escapeHtml(interestedLine)}</div>` : ''}
              </td>
            </tr>
          </table>
        </a>
      </td>
    </tr>`
}

function longDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function monthDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

// Shared by the real cron send (send-due.ts) and the admin test-send dev
// tool (service.ts) — one place for the subject line, same reason
// newsletter/template.ts's newsletterSubject exists. A single-day break
// (feedback #120's own example, "Monday, September 25") reads with a full
// weekday name; a multi-day block (Winter Break, say) reads as a plain date
// range instead, since a block has no single weekday to name.
export function campReminderSubject(startDate: string, endDate: string, prefix = ''): string {
  if (startDate === endDate) {
    return `${prefix}Nettelhorst closed on ${longDate(startDate)} – do you need a day off camp?`
  }
  return `${prefix}Nettelhorst closed ${monthDay(startDate)} – ${monthDay(endDate)} – do you need day off camps?`
}

export function renderCampReminderHtml(options: {
  camps: FormattedCamp[]
  breakName: string
  startDate: string
  endDate: string
  recipient: ReminderRecipient
  apiUrl: string
  webUrl: string
  unsubscribeUrl: string
}): string {
  const { camps, breakName, startDate, endDate, recipient, apiUrl, webUrl, unsubscribeUrl } = options
  const dateRange = startDate === endDate ? longDate(startDate) : `${monthDay(startDate)} – ${monthDay(endDate)}`
  const rows = camps.map((camp) => campRowHtml(camp, recipient, apiUrl, webUrl)).join('')

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
                <h1 style="font-size:20px;margin:0 0 4px;color:#111111;">Nettelhorst is closed: ${escapeHtml(breakName)}</h1>
                <p style="color:#666666;font-size:14px;margin:0;">Hi ${escapeHtml(recipient.name)}, school's out ${escapeHtml(dateRange)} — need a day off camp?</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td>
            </tr>
            <tr>
              <td style="padding:24px;text-align:center;">
                <a href="${webUrl}/camps" style="display:inline-block;background:#111111;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">See all camps</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;text-align:center;color:#999999;font-size:12px;">
                <a href="${unsubscribeUrl}" style="color:#999999;">Unsubscribe from this email</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
