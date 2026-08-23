import {
  bookingStatusChipStyle,
  bookingStatusLabel,
  buildInterestedTeaser,
  campDetailsLine,
  distanceLabel,
  formatDateRange,
  locationLabel,
  sortCamps,
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
  // Raw status, kept alongside the two rendered forms below (bookingLabel/
  // bookingChip) — sortCamps (see renderCampReminderHtml) needs the real
  // value to check for 'open', not the already-humanized label/color pair.
  bookingStatus: string | null
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
    bookingStatus: camp.bookingStatus,
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

// Small stacked circular avatars ahead of the "N interested: ..." text —
// same shape as the in-app InterestedBadge's stacked icons and
// connections/template.ts's own circular avatar embed (both border-
// radius:50%, an absolute apiUrl-prefixed src since a relative upload path
// means nothing in an email client). Skips anyone with no avatar (required
// at onboarding — see CLAUDE.md's Login section — so this is only ever a
// pre-required-photo account), same "omit, don't show a broken image"
// posture connections/template.ts already established, and caps at 5 for
// the same reason InterestedBadge's own MAX_STACKED_ICONS does.
const MAX_INTERESTED_AVATARS = 5

function interestedAvatarsHtml(people: FormattedCamp['interestedNames'], apiUrl: string): string {
  const withAvatars = people.filter((p): p is (typeof people)[number] & { avatarUrl: string } => p.avatarUrl !== null)
  if (withAvatars.length === 0) return ''
  const imgs = withAvatars
    .slice(0, MAX_INTERESTED_AVATARS)
    .map(
      (p, i) =>
        `<img src="${apiUrl}${p.avatarUrl}" width="20" height="20" style="display:inline-block;width:20px;height:20px;object-fit:cover;border-radius:50%;border:2px solid #ffffff;vertical-align:middle;${i > 0 ? 'margin-left:-8px;' : ''}" alt="" />`,
    )
    .join('')
  return `<span style="display:inline-block;vertical-align:middle;margin-right:6px;">${imgs}</span>`
}

// Field order mirrors the in-app compact camp row (web/src/camps/
// CampsPage.tsx's CampRow — feedback #120: "render them very closely to how
// they rendered on the site"): thumbnail, title, date, time, booking-status
// badge, location/distance, price/age/spots line, interested-count line
// (now with stacked avatars, feedback following #120: "I don't see the
// images for who's interested"). Table-based layout with inline styles,
// same email-client-compatibility posture as newsletter/template.ts's
// eventRowHtml, which this otherwise mirrors closely.
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
                ${interestedLine ? `<div style="margin-top:6px;">${interestedAvatarsHtml(camp.interestedNames, apiUrl)}<span style="color:${SECONDARY_TEXT_COLOR};font-size:13px;vertical-align:middle;">${escapeHtml(interestedLine)}</span></div>` : ''}
              </td>
            </tr>
          </table>
        </a>
      </td>
    </tr>`
}

// "camp"/"camps" — used by both the subject and the body's own preamble
// line, so the two can never drift into disagreeing on singular vs. plural.
function dayOffCampQuestion(startDate: string, endDate: string): string {
  return startDate === endDate ? 'need a day off camp?' : 'need day off camps?'
}

// Reused by both the subject line and the body's own heading — camps/
// format.ts's own formatDateRange, the exact abbreviated date format an
// in-app camp row already shows ("Fri, Sep 25" for a single day, "Dec 21 –
// Jan 1" for a range), rather than a bespoke long-form date (feedback,
// after #120 shipped: "use the abbreviated date format... just like we
// would in the app... saves space and makes a more concise subject line").
// 'detailed' mode (not the per-camp rows' default 'summary') so a same-week
// break still shows its actual date, not just "This Friday" — a reminder
// email has no surrounding list/section context to lean on the way an
// in-app row does, the same reasoning camps/format.ts's own header comment
// gives for using 'detailed' on a page reached directly, with no context.
function subjectDateLabel(startDate: string, endDate: string, now: Date): string {
  return formatDateRange(startDate, endDate, now, 'detailed')
}

// Shared by the real cron send (send-due.ts) and the admin test-send dev
// tool (service.ts) — one place for the subject line, same reason
// newsletter/template.ts's newsletterSubject exists.
export function campReminderSubject(startDate: string, endDate: string, prefix = '', now = new Date()): string {
  return `${prefix}Nettelhorst closed ${subjectDateLabel(startDate, endDate, now)} – ${dayOffCampQuestion(startDate, endDate)}`
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
  const dateRange = subjectDateLabel(startDate, endDate, new Date())
  const question = dayOffCampQuestion(startDate, endDate)
  // Same priority order as the in-app Camps tab (camps/format.ts's
  // sortCamps, also used by camps/routes.ts's loadUpcomingCamps): the
  // recipient's own starred camp first, then most-broadly-interested, then
  // booking-open, then alphabetical (feedback following #120: "should apply
  // both in the email and in the app"). "Starred by the recipient" is
  // recipient-specific — camps was fetched once and is reused across every
  // recipient's send, so this reorder has to happen per recipient, right
  // here, rather than once up front in formatReminderCamps.
  const sortedCamps = sortCamps(
    camps.map((camp) => ({ ...camp, viewerInterested: camp.interestedNames.some((p) => p.id === recipient.id) })),
  )
  const rows = sortedCamps.map((camp) => campRowHtml(camp, recipient, apiUrl, webUrl)).join('')

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
                <p style="color:#111111;font-size:16px;margin:0;">Hi ${escapeHtml(recipient.name)}, Nettelhorst is off ${escapeHtml(dateRange)} for ${escapeHtml(breakName)} — ${question}</p>
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
