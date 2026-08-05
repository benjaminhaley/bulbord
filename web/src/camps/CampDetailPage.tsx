import {
  IonBackButton,
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

import { API_URL } from '../config'
import { Avatar } from '../uploads/Avatar'
import { deleteCamp, fetchCamp, updateCamp, type Camp, type CampOptionLine, type CampPrepLine } from './api'
import { CampForm } from './CampForm'
import { CommentsSection } from './CommentsSection'
import { campDetailsLine, formatDateRange, mapUrl, optionAgeCell, optionPriceCell, optionTimeCell, shortAddress, timeLabel } from './format'
import { InterestedBadge } from './InterestedBadge'
import { useCampInterest } from './useCampInterest'

// One consistent rhythm for every short fact line above the Options section
// (date, time, stat line, address, description, etc.) — feedback,
// 2026-08-05: "the line spacing here is inconsistent... should only change
// when you want to display the information in a noticeably different way."
// Plain <p> tags with no override fall back to the browser's default ~1em
// margin, which reads as loose next to the tight 4px rhythm the bulleted
// lists below already use (LabeledBulletList) — this constant matches that
// same rhythm so the whole page (not just each section in isolation) feels
// like one consistent block, with real headings (<h1>/<h2>) staying the
// only intentionally larger gaps, since those mark genuine section breaks.
const FACT_LINE_STYLE = { margin: '4px 0' } as const

// "What to bring / prepare" section — each CampPrepLine becomes its own
// bullet, label always bold, detail always plain (feedback, 2026-08-05:
// "the item should probably be somehow set apart from the description";
// then later that same day: real structured data instead of a
// hand-formatted string, so this can never again drift into the
// inconsistent-bolding bugs a free-text version needed a whole session of
// corrections to catch — see CampPrepLine in api.ts). Options has its own
// OptionsTable below instead — a packing-list item has no time/age/price to
// line up in columns, so a table would add structure with nothing to show.
function LabeledBulletList({ lines }: { lines: CampPrepLine[] }) {
  return (
    <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
      {lines.map((line) => (
        <li key={line.label} style={{ marginBottom: 4 }}>
          <strong>{line.label}</strong>
          {line.detail && `: ${line.detail}`}
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
// Price) rather than the flowing bulleted-sub-line format this replaced,
// since every option now carries the same structured fields and a genuine
// table is what makes same-column values (all the prices, all the ages)
// comparable at a glance. `note` renders as a small subtext line under the
// label rather than its own column, since it's free text of varying
// length that would break a fixed-width column. Wrapped in a horizontally-
// scrolling div as a safety net for an unusually long label, not because
// the table is expected to overflow a normal phone width.
function OptionsTable({ options }: { options: CampOptionLine[] }) {
  return (
    <div style={{ overflowX: 'auto', margin: '4px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ color: 'var(--ion-color-medium)', fontSize: 12 }}>
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px 0' }}>Option</th>
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px' }}>Time</th>
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px' }}>Ages</th>
            <th style={{ textAlign: 'right', fontWeight: 'normal', padding: '0 0 4px 6px' }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {options.map((option) => (
            <tr key={option.label} style={{ borderTop: '1px solid var(--ion-color-step-150, #d9d9d9)' }}>
              <td style={{ verticalAlign: 'top', padding: '6px 6px 6px 0' }}>
                <strong>{option.label}</strong>
                {option.note && <div style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>{option.note}</div>}
              </td>
              <td style={{ verticalAlign: 'top', padding: '6px' }}>
                <OptionCell value={optionTimeCell(option.start_time, option.end_time)} />
              </td>
              <td style={{ verticalAlign: 'top', padding: '6px' }}>
                <OptionCell value={optionAgeCell(option.age_min, option.age_max)} />
              </td>
              <td style={{ verticalAlign: 'top', textAlign: 'right', padding: '6px 0 6px 6px' }}>
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

  // Once a camp has a real Options breakdown, every option row shows its
  // own time/age/price — repeating the max-time summary above the table
  // again would be redundant (feedback, 2026-08-05). A camp with no
  // options (member-submitted, or a provider with just a flat rate) has no
  // table to fall back on, so it keeps the full top summary.
  const hasOptions = camp?.options != null && camp.options.length > 0
  const details = camp ? campDetailsLine(camp, { includePrice: !hasOptions, includeAge: !hasOptions }) : null

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
            <h1>{camp.title}</h1>
            <p style={FACT_LINE_STYLE}>{formatDateRange(camp.start_date, camp.end_date)}</p>
            {!hasOptions && <p style={FACT_LINE_STYLE}>{timeLabel(camp.start_time, camp.end_time)}</p>}
            {camp.submitted_by && (
              <p style={{ ...FACT_LINE_STYLE, color: 'var(--ion-color-medium)' }}>Posted by {camp.submitted_by.name}</p>
            )}
            {details !== null && <p style={FACT_LINE_STYLE}>{details}</p>}
            {camp.interested_count > 0 && (
              <InterestedBadge campId={camp.id} count={camp.interested_count} people={camp.interested_people} />
            )}
            {camp.location_name && <p style={FACT_LINE_STYLE}>{camp.location_name}</p>}
            {camp.address && (
              <p style={FACT_LINE_STYLE}>
                <a href={mapUrl(camp.address)} target="_blank" rel="noreferrer">
                  {shortAddress(camp.address)}
                </a>
              </p>
            )}
            {camp.description && <p style={FACT_LINE_STYLE}>{camp.description}</p>}
            {camp.options && camp.options.length > 0 ? (
              <>
                <h2>Options</h2>
                <OptionsTable options={camp.options} />
              </>
            ) : (
              camp.options_note && (
                <>
                  <h2>Options</h2>
                  <p style={FACT_LINE_STYLE}>{camp.options_note}</p>
                </>
              )
            )}
            {camp.prep_items && camp.prep_items.length > 0 ? (
              <>
                <h2>What to bring / prepare</h2>
                <LabeledBulletList lines={camp.prep_items} />
              </>
            ) : (
              camp.prep_note && (
                <>
                  <h2>What to bring / prepare</h2>
                  <p style={FACT_LINE_STYLE}>{camp.prep_note}</p>
                </>
              )
            )}
            <CommentsSection campId={camp.id} source={camp.source} />
            {(camp.booking_instructions || camp.source_url) && (
              <>
                <h2>Booking</h2>
                {camp.booking_instructions && (
                  <p style={{ ...FACT_LINE_STYLE, whiteSpace: 'pre-wrap' }}>{camp.booking_instructions}</p>
                )}
                {camp.source_url && (
                  <IonButton expand="block" href={camp.source_url} target="_blank" rel="noreferrer">
                    View Booking Page
                  </IonButton>
                )}
              </>
            )}
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
