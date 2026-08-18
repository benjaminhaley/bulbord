import { IonBackButton, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonSpinner, IonTitle, IonToolbar } from '@ionic/react'
import { createOutline, star, starOutline, trashOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { useHistory, useParams } from 'react-router-dom'

import { AddToCalendarButton } from '../calendar/AddToCalendarButton'
import { API_URL } from '../config'
import { factLineStyle, headingContentGap, leadingButtonGap, sectionDividerStyle } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { deleteSportsClub, fetchSportsClub, updateSportsClub, type SportsClub, type SportsClubOptionLine } from './api'
import { CommentsSection } from './CommentsSection'
import {
  calendarEventForSportsClub,
  distanceLabel,
  mapUrl,
  occurrenceLabel,
  optionAgeCell,
  optionPriceCell,
  optionTimeCell,
  originalPriceLabel,
  scheduleSummary,
  shortAddress,
  signupStatusChipStyle,
  signupStatusLabel,
  sportsClubDetailsLine,
} from './format'
import { InterestedBadge } from './InterestedBadge'
import { SportsClubForm } from './SportsClubForm'
import { useSportsClubInterest } from './useSportsClubInterest'

// The number of upcoming dates shown before a "+N more" reveal — the
// detail fetch returns the full bounded-window schedule (see api/src/
// sports-clubs/routes.ts), which can run to a few dozen rows for a
// long-running weekly listing; capping the default view keeps the page
// scannable, same reveal-row convention used throughout this app.
const OCCURRENCE_PREVIEW_LIMIT = 6

// A blank/inapplicable table cell — quieter than the row's own text so the
// eye lands on the cells that actually have data. Mirrors Camps'
// identically-purposed OptionCell.
function OptionCell({ value }: { value: string }) {
  return value === '—' ? <span style={{ color: 'var(--ion-color-medium)' }}>—</span> : <>{value}</>
}

// A listing's real, distinct bookable tiers (see api/src/db/schema.ts's
// SportsClubOptionLine) rendered as a real 4-column table — Option / Time /
// Ages / Price — same shape and same reasoning as Camps' OptionsTable: once
// a listing genuinely has more than one option, every tier's numbers need
// to line up in a scannable column, not flow as prose (feedback, 2026-08-18,
// after Uniting Voices Chicago's three levels were crammed into one
// cadence_note paragraph and read as a wall of text). `note` renders as a
// small subtext line under the label, same as Camps.
function OptionsTable({ options }: { options: SportsClubOptionLine[] }) {
  const nowrapCellStyle = { verticalAlign: 'top' as const, padding: '6px', whiteSpace: 'nowrap' as const }
  return (
    <div style={{ overflowX: 'auto', marginTop: headingContentGap.marginTop, marginBottom: 4 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ color: 'var(--ion-color-medium)', fontSize: 12 }}>
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px 0' }} />
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px', whiteSpace: 'nowrap' }}>Time</th>
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px', whiteSpace: 'nowrap' }}>Ages</th>
            <th style={{ textAlign: 'right', fontWeight: 'normal', padding: '0 0 4px 6px', whiteSpace: 'nowrap' }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {options.map((option) => (
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
                <OptionCell value={optionPriceCell(option.price, option.price_unit)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SportsClubDetailPage() {
  const { id } = useParams<{ id: string }>()
  const history = useHistory()
  const [club, setClub] = useState<SportsClub | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showAllOccurrences, setShowAllOccurrences] = useState(false)
  const { pending: interestPending, setInterest, clearInterest } = useSportsClubInterest(setClub)

  async function remove() {
    if (!club || !window.confirm('Delete this listing?')) return
    await deleteSportsClub(club.id)
    history.push('/sports-clubs')
  }

  function toggleInterest() {
    if (!club) return
    if (club.interest_status === 'interested') {
      clearInterest(club)
    } else {
      setInterest(club, 'interested')
    }
  }

  useEffect(() => {
    setClub(null)
    setError(false)
    setShowAllOccurrences(false)
    fetchSportsClub(id)
      .then(setClub)
      .catch(() => setError(true))
  }, [id])

  // Once a listing has a real Options breakdown, every row shows its own
  // time/age/price — repeating the summary line above the table again would
  // be redundant, same suppression Camps' detail page already established.
  const hasOptions = club?.options != null && club.options.length > 0
  const details = club ? sportsClubDetailsLine(club, { includePrice: !hasOptions, includeAge: !hasOptions }) : null
  const originalPrice = club ? originalPriceLabel(club.price, club.price_unit) : null
  const visibleOccurrences = club ? (showAllOccurrences ? club.occurrences : club.occurrences.slice(0, OCCURRENCE_PREVIEW_LIMIT)) : []
  const remainingOccurrences = club ? club.occurrences.length - visibleOccurrences.length : 0
  const calendarEvent = club ? calendarEventForSportsClub(club) : null

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/sports-clubs" />
          </IonButtons>
          <IonTitle>{club?.title ?? 'Sports & Clubs'}</IonTitle>
          {club && (
            <IonButtons slot="end">
              {club.can_edit && !editing && (
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
                  icon={club.interest_status === 'interested' ? star : starOutline}
                  color={club.interest_status === 'interested' ? 'warning' : undefined}
                />
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!club && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this listing</p>
          </div>
        )}
        {club && editing && (
          <SportsClubForm
            initial={club}
            submitLabel="Save"
            errorMessage="Could not save changes"
            onSubmit={async (input) => {
              setClub(await updateSportsClub(club.id, input))
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        )}
        {club && !editing && (
          <>
            {club.image_url ? (
              <img src={`${API_URL}${club.image_url}`} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 16 }} />
            ) : (
              club.submitted_by && (
                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}>
                  <Avatar url={club.submitted_by.avatar_url} name={club.submitted_by.name} size={120} />
                </div>
              )
            )}
            {/* No <h1> here — same reasoning as Camps'/Events' detail pages:
                the toolbar's IonTitle above already shows the name and
                stays visible while scrolled. Top section order mirrors
                Camps' own detail page exactly (date -> cadence/time ->
                posted-by -> price/age -> interested -> location -> address
                -> description) — feedback (2026-08-18) removed the
                schedule-type badge chip (the words in scheduleSummary
                already say "Ongoing — join anytime" or the real date range,
                so the colored pill was purely decorative) and moved
                price_note/the real original price out of this top section
                entirely when a listing has an Options table, same as
                Camps' optionsNote only appearing near its own table, never
                unconditionally at the top. */}
            <p style={factLineStyle}>{scheduleSummary(club)}</p>
            {!hasOptions && club.cadence_note && <p style={factLineStyle}>{club.cadence_note}</p>}
            {club.submitted_by && (
              <p style={{ ...factLineStyle, color: 'var(--ion-color-medium)' }}>Posted by {club.submitted_by.name}</p>
            )}
            {details && <p style={factLineStyle}>{details}</p>}
            {!hasOptions && club.price_note && <p style={factLineStyle}>{club.price_note}</p>}
            {!hasOptions && originalPrice && (
              <p style={{ ...factLineStyle, color: 'var(--ion-color-medium)', fontSize: '0.85em' }}>Published rate: {originalPrice}</p>
            )}
            {club.interested_count > 0 && (
              <InterestedBadge sportsClubId={club.id} count={club.interested_count} people={club.interested_people} emphasized />
            )}
            {club.location_name && <p style={factLineStyle}>{club.location_name}</p>}
            {club.address && (
              <p style={factLineStyle}>
                <a href={mapUrl(club.address)} target="_blank" rel="noreferrer">
                  {shortAddress(club.address)}
                </a>
                {' · '}
                {distanceLabel(club.distance_miles)}
              </p>
            )}
            {club.description && <p style={factLineStyle}>{club.description}</p>}
            {hasOptions && club.options && (
              <>
                <hr style={sectionDividerStyle} />
                <h2>Options</h2>
                {club.cadence_note && <p style={factLineStyle}>{club.cadence_note}</p>}
                <OptionsTable options={club.options} />
                {club.price_note && <p style={factLineStyle}>{club.price_note}</p>}
              </>
            )}
            {club.occurrences.length > 0 && (
              <>
                <hr style={sectionDividerStyle} />
                <h2>Upcoming dates</h2>
                <ul style={{ marginTop: 8, marginBottom: 4, paddingLeft: 20 }}>
                  {visibleOccurrences.map((occ) => (
                    <li key={occ.date} style={{ marginBottom: 4 }}>
                      {occurrenceLabel(occ)}
                      {occ.note && <span style={{ color: 'var(--ion-color-medium)' }}> — {occ.note}</span>}
                    </li>
                  ))}
                </ul>
                {remainingOccurrences > 0 && (
                  <IonButton fill="clear" size="small" onClick={() => setShowAllOccurrences(true)}>
                    +{remainingOccurrences} more {remainingOccurrences === 1 ? 'date' : 'dates'}
                  </IonButton>
                )}
              </>
            )}
            <hr style={sectionDividerStyle} />
            <h2>Sign-up</h2>
            <IonBadge style={{ ...signupStatusChipStyle(club.signup_status), fontWeight: 500, marginBottom: 8 }}>
              {signupStatusLabel(club.signup_status)}
            </IonBadge>
            {club.signup_instructions && <p style={{ ...factLineStyle, whiteSpace: 'pre-wrap' }}>{club.signup_instructions}</p>}
            <CommentsSection sportsClubId={club.id} source={club.source} />
            {calendarEvent && (
              <AddToCalendarButton
                event={{ ...calendarEvent, url: window.location.href }}
                filename={`${club.title}.ics`}
                style={club.source_url ? leadingButtonGap : { ...leadingButtonGap, marginBottom: 72 }}
              />
            )}
            {club.source_url && (
              <IonButton
                expand="block"
                href={club.source_url}
                target="_blank"
                rel="noreferrer"
                style={{ ...leadingButtonGap, marginBottom: 72 }}
              >
                View Sign-up Page
              </IonButton>
            )}
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
