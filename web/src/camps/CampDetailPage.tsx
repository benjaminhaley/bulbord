import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { createOutline, star, starOutline, trashOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { useHistory, useParams } from 'react-router-dom'

import { track } from '../analytics/api'
import { AddToCalendarButton } from '../calendar/AddToCalendarButton'
import { API_URL } from '../config'
import { factLineStyle, headingContentGap, leadingButtonGap, sectionDividerStyle } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { deleteCamp, fetchCamp, updateCamp, type Camp, type CampOptionLine, type CampPrepLine } from './api'
import { CampForm } from './CampForm'
import { CommentsSection } from './CommentsSection'
import {
  bookingStatusChipStyle,
  bookingStatusLabel,
  campDetailsLine,
  distanceLabel,
  formatDateRange,
  mapUrl,
  optionAgeCell,
  optionPriceCell,
  optionTimeCell,
  shortAddress,
  sortOptionsByPrice,
  timeLabel,
} from './format'
import { InterestedBadge } from './InterestedBadge'
import { useCampInterest } from './useCampInterest'

// factLineStyle/sectionDividerStyle (theme/layout.ts) are the promoted,
// shared versions of what used to be local consts here — see that file's
// own comments for the full rationale (feedback, 2026-08-05, and the style
// audit, feedback #70, which is also where headingContentGap/
// leadingButtonGap below came from: real gaps found missing, not just
// misapplied, between a heading and its first content and before a
// standalone CTA button).

// "What to bring / prepare" section — each CampPrepLine becomes its own
// bullet, label always bold, detail always plain (feedback, 2026-08-05:
// "the item should probably be somehow set apart from the description";
// then later that same day: real structured data instead of a
// hand-formatted string, so this can never again drift into the
// inconsistent-bolding bugs a free-text version needed a whole session of
// corrections to catch — see CampPrepLine in api.ts). Options has its own
// OptionsTable below instead — a packing-list item has no time/age/price to
// line up in columns, so a table would add structure with nothing to show.
// detail renders on its own line below the label, not inline after a colon
// (feedback, 2026-08-05: "remove the colon and instead use a new line
// after the bolded segment... it should not have its own bullet, only the
// bold [label] should") — a block-level child inside the same <li> pushes
// it to the next line while keeping it part of that one bullet, same
// pattern the Options table's per-row `note` already uses.
function LabeledBulletList({ lines }: { lines: CampPrepLine[] }) {
  return (
    <ul style={{ marginTop: headingContentGap.marginTop, marginBottom: 4, paddingLeft: 20 }}>
      {lines.map((line) => (
        <li key={line.label} style={{ marginBottom: 8 }}>
          <strong>{line.label}</strong>
          {line.detail && <div>{line.detail}</div>}
        </li>
      ))}
    </ul>
  )
}

// A blank/inapplicable table cell — same visual convention as a real
// printed schedule, deliberately quieter than the row's own text so the eye
// lands on the cells that actually have data.
function OptionCell({ value }: { value: string }) {
  return value === '—' ? <span style={{ color: 'var(--ion-color-medium)' }}>—</span> : <>{value}</>
}

// The Options section's primary rendering (feedback, 2026-08-05: "look a
// little more tabular and easier to scan... aligned and skimmable... fits
// on the screen well") — a real 4-column table (Option / Time / Ages /
// Price/day) rather than the flowing bulleted-sub-line format this
// replaced, since every option now carries the same structured fields and
// a genuine table is what makes same-column values (all the prices, all
// the ages) comparable at a glance. `note` renders as a small subtext line
// under the label rather than its own column, since it's free text of
// varying length that would break a fixed-width column — reserved for a
// genuine per-tier detail (e.g. Family Room's duration, which has no fixed
// clock time to show in the Time column), not a multi-date/bulk aside like
// a weekly rate (that belongs in the Options section's general notes
// instead — see CampDetailPage's use of camp.options_note below). Rows are
// sorted most-expensive-first (sortOptionsByPrice) rather than trusting
// the seed data's own array order. Wrapped in a horizontally-scrolling div
// as a safety net for an unusually long label, not because the table is
// expected to overflow a normal phone width. Column header says
// "Price/day" (not just "Price") so the unit stays clear now that a
// per-tier "/week" aside is never shown alongside it in the same cell. The
// first column has no header text (feedback, 2026-08-05: "remove the word
// option from the table header... it's redundant with the heading up
// above" — the "Options" <h2> right above the table already says what the
// column is). Time/Ages/Price get `whiteSpace: 'nowrap'` (feedback,
// 2026-08-05, from a screenshot where a long label like "Full day +
// after-camp extension" squeezed "8 am – 6 pm" and "4-12" into an ugly
// mid-word wrap: "the name should wrap, but the other column should have
// enough space") — only the Option label is ever long enough to need
// wrapping; the other three are always short, and the table's own
// auto-layout gives them exactly the room they need once they can't wrap.
function OptionsTable({ options }: { options: CampOptionLine[] }) {
  const sorted = sortOptionsByPrice(options)
  const nowrapCellStyle = { verticalAlign: 'top' as const, padding: '6px', whiteSpace: 'nowrap' as const }
  return (
    <div style={{ overflowX: 'auto', marginTop: headingContentGap.marginTop, marginBottom: 4 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ color: 'var(--ion-color-medium)', fontSize: 12 }}>
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px 0' }} />
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px', whiteSpace: 'nowrap' }}>Time</th>
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px', whiteSpace: 'nowrap' }}>Ages</th>
            <th style={{ textAlign: 'right', fontWeight: 'normal', padding: '0 0 4px 6px', whiteSpace: 'nowrap' }}>Price/day</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((option) => (
            <tr key={option.label} style={{ borderTop: '1px solid var(--ion-color-step-150, #d9d9d9)' }}>
              <td style={{ verticalAlign: 'top', padding: '6px 6px 6px 0' }}>
                <strong>{option.label}</strong>
                {option.note && <div style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>{option.note}</div>}
              </td>
              <td style={nowrapCellStyle}>
                <OptionCell value={optionTimeCell(option.start_time, option.end_time)} />
              </td>
              <td style={nowrapCellStyle}>
                <OptionCell value={optionAgeCell(option.age_min, option.age_max)} />
              </td>
              <td style={{ ...nowrapCellStyle, textAlign: 'right', padding: '6px 0 6px 6px' }}>
                <OptionCell value={optionPriceCell(option.price)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CampDetailPage() {
  const { id } = useParams<{ id: string }>()
  const history = useHistory()
  const [camp, setCamp] = useState<Camp | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const { pending: interestPending, setInterest, clearInterest } = useCampInterest(setCamp)

  async function remove() {
    if (!camp || !window.confirm('Delete this camp?')) return
    await deleteCamp(camp.id)
    history.push('/camps')
  }

  function toggleInterest() {
    if (!camp) return
    if (camp.interest_status === 'interested') {
      clearInterest(camp)
    } else {
      setInterest(camp, 'interested')
    }
  }

  useEffect(() => {
    setCamp(null)
    setError(false)
    fetchCamp(id)
      .then(setCamp)
      .catch(() => setError(true))
  }, [id])

  // Feedback #96's "number of people viewing events" — the same signal for
  // Camps, so the analytics page's people-viewing tiles cover both tabs.
  useEffect(() => {
    track('camp_viewed', { campId: id }).catch(() => {})
  }, [id])

  // Once a camp has a real Options breakdown, every option row shows its
  // own time/age/price — repeating the max-time summary above the table
  // again would be redundant (feedback, 2026-08-05). A camp with no
  // options (member-submitted, or a provider with just a flat rate) has no
  // table to fall back on, so it keeps the full top summary.
  const hasOptions = camp?.options != null && camp.options.length > 0
  const details = camp ? campDetailsLine(camp, { includePrice: !hasOptions, includeAge: !hasOptions }) : null

  // Feedback, 2026-08-14: the calendar event's own description should
  // include what to bring/prepare, not just the camp's plain description —
  // a member checking their calendar app later has no other way back to
  // this info without reopening the app. Plain-text bullets (a calendar
  // description field has no rich list rendering), mirroring
  // LabeledBulletList's label/detail shape.
  const prepText = camp
    ? camp.prep_items && camp.prep_items.length > 0
      ? camp.prep_items.map((item) => `- ${item.label}${item.detail ? `: ${item.detail}` : ''}`).join('\n')
      : camp.prep_note
    : null
  const calendarDescription = camp
    ? [camp.description, prepText ? `What to bring / prepare:\n${prepText}` : null]
        .filter((v): v is string => Boolean(v))
        .join('\n\n') || null
    : null

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/camps" />
          </IonButtons>
          <IonTitle>{camp?.title ?? 'Camp'}</IonTitle>
          {camp && (
            <IonButtons slot="end">
              {camp.can_edit && !editing && (
                <>
                  <IonButton onClick={() => setEditing(true)}>
                    <IonIcon slot="icon-only" icon={createOutline} />
                  </IonButton>
                  <IonButton color="danger" onClick={remove}>
                    <IonIcon slot="icon-only" icon={trashOutline} />
                  </IonButton>
                </>
              )}
              <IonButton disabled={interestPending} onClick={toggleInterest}>
                <IonIcon
                  slot="icon-only"
                  icon={camp.interest_status === 'interested' ? star : starOutline}
                  color={camp.interest_status === 'interested' ? 'warning' : undefined}
                />
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!camp && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this camp</p>
          </div>
        )}
        {camp && editing && (
          <CampForm
            initial={camp}
            submitLabel="Save"
            errorMessage="Could not save changes"
            onSubmit={async (input) => {
              setCamp(await updateCamp(camp.id, input))
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        )}
        {camp && !editing && (
          <>
            {camp.image_url ? (
              <img
                src={`${API_URL}${camp.image_url}`}
                alt=""
                style={{ width: '100%', borderRadius: 12, marginBottom: 16 }}
              />
            ) : (
              camp.submitted_by && (
                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}>
                  <Avatar url={camp.submitted_by.avatar_url} name={camp.submitted_by.name} size={120} />
                </div>
              )
            )}
            {/* No <h1>{camp.title}</h1> here (feedback, 2026-08-05: "ClimbZone
                Chicago is redundant here. Repeated twice. And the top one
                actually persists as we scroll. So let's just get rid of the
                first header") — the toolbar's IonTitle above already shows the
                camp's name and stays visible the whole time the page is
                scrolled, so a second, large title directly below the image
                was pure duplication. */}
            {/* 'detailed' mode (feedback #78): see EventDetailPage.tsx's
                identical comment — a detail page has no surrounding list
                context, so the relative word gets the actual date alongside
                it for clarity. */}
            <p style={factLineStyle}>{formatDateRange(camp.start_date, camp.end_date, undefined, 'detailed')}</p>
            {!hasOptions && <p style={factLineStyle}>{timeLabel(camp.start_time, camp.end_time)}</p>}
            {camp.submitted_by && (
              <p style={{ ...factLineStyle, color: 'var(--ion-color-medium)' }}>Posted by {camp.submitted_by.name}</p>
            )}
            {details && <p style={factLineStyle}>{details}</p>}
            {camp.interested_count > 0 && (
              <InterestedBadge campId={camp.id} count={camp.interested_count} people={camp.interested_people} emphasized />
            )}
            {camp.location_name && <p style={factLineStyle}>{camp.location_name}</p>}
            {camp.address && (
              <p style={factLineStyle}>
                <a href={mapUrl(camp.address)} target="_blank" rel="noreferrer">
                  {shortAddress(camp.address)}
                </a>
                {/* Distance lives next to the address, not the price/age line
                    above (feedback, 2026-08-05: "put the distance side by side
                    with the address... it's just more relevant for address
                    information") — separated by the same " · " convention used
                    everywhere else on this page, but plain text so it doesn't
                    extend the map link. */}
                {' · '}
                {distanceLabel(camp.distance_miles)}
              </p>
            )}
            {camp.description && <p style={factLineStyle}>{camp.description}</p>}
            {(camp.options && camp.options.length > 0) || camp.options_note ? (
              <>
                <hr style={sectionDividerStyle} />
                <h2>Options</h2>
                {camp.options && camp.options.length > 0 && <OptionsTable options={camp.options} />}
                {/* A hand-seeded provider's asides that don't belong as their own
                    bookable table row — a sibling discount, a weekly rate — live
                    here instead (feedback, 2026-08-05: "don't include it in the
                    list of options table. Instead, there should be some sort of
                    notes field at the bottom"). Doubles as the member
                    self-service fallback (the only thing shown when there's no
                    options table at all) — same field, same posture either way. */}
                {camp.options_note && <p style={factLineStyle}>{camp.options_note}</p>}
              </>
            ) : null}
            {camp.prep_items && camp.prep_items.length > 0 ? (
              <>
                <hr style={sectionDividerStyle} />
                <h2>What to bring / prepare</h2>
                <LabeledBulletList lines={camp.prep_items} />
              </>
            ) : (
              camp.prep_note && (
                <>
                  <hr style={sectionDividerStyle} />
                  <h2>What to bring / prepare</h2>
                  <p style={factLineStyle}>{camp.prep_note}</p>
                </>
              )
            )}
            <CommentsSection campId={camp.id} source={camp.source} />
            <hr style={sectionDividerStyle} />
            <h2>Booking</h2>
            {/* Whether registration is actually open right now (feedback
                #68) — leads the section since it's the single most
                actionable fact here, ahead of the static how-to-register
                text and the link itself. */}
            <IonBadge style={{ ...bookingStatusChipStyle(camp.booking_status), fontWeight: 500, marginBottom: 8 }}>
              {bookingStatusLabel(camp.booking_status)}
            </IonBadge>
            {camp.booking_instructions && (
              <p style={{ ...factLineStyle, whiteSpace: 'pre-wrap' }}>{camp.booking_instructions}</p>
            )}
            {/* Feedback #76: lets a member add this camp to their own
                calendar (Google/Outlook/.ics — see AddToCalendarButton).
                Sits directly above "View Booking Page" (feedback,
                2026-08-14: "keep it consistent with events" — Events'
                identical button sits directly above its own "View source"
                link the same way). A multi-day camp (start_date !==
                end_date) always becomes an all-day calendar block spanning
                the whole range — a specific daily time (e.g. "9am-3pm each
                day of a school break") can't be represented as a single
                calendar event without a recurrence rule, which is more than
                this needs — only a genuinely single-day camp's own
                start_time/end_time become a timed block. */}
            <AddToCalendarButton
              event={{
                title: camp.title,
                description: calendarDescription,
                location: camp.location_name ?? camp.address,
                url: window.location.href,
                startDate: camp.start_date,
                endDate: camp.end_date,
                startTime: camp.start_date === camp.end_date ? camp.start_time : null,
                endTime: camp.start_date === camp.end_date ? camp.end_time : null,
                allDay: camp.start_date !== camp.end_date,
              }}
              filename={`${camp.title}.ics`}
              // marginBottom clears the persistent floating share button
              // (feedback, 2026-08-05, originally about the booking link —
              // see below) whenever this is the last button on the page,
              // i.e. there's no source_url to show "View Booking Page"
              // beneath it.
              style={camp.source_url ? leadingButtonGap : { ...leadingButtonGap, marginBottom: 72 }}
            />
            {camp.source_url && (
              // marginBottom clears the persistent floating share button
              // (feedback, 2026-08-05: "generally clean up the look of the
              // booking link, which is kind of squashed up there") — the
              // share button is fixed in the bottom-right corner above the
              // tab bar on every page (see index.css's .share-fab), so a
              // full-width block button ending the page would otherwise sit
              // flush against it with no breathing room once scrolled all
              // the way down.
              <IonButton
                expand="block"
                href={camp.source_url}
                target="_blank"
                rel="noreferrer"
                style={{ ...leadingButtonGap, marginBottom: 72 }}
              >
                View Booking Page
              </IonButton>
            )}
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
