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
import { deleteCamp, fetchCamp, updateCamp, type Camp } from './api'
import { CampForm } from './CampForm'
import { CommentsSection } from './CommentsSection'
import { campDetailsLine, formatDateRange, mapUrl, shortAddress, timeLabel } from './format'
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

// Shared by the Options and "What to bring / prepare" sections below — each
// line (from a '\n'-joined price_details/prep_instructions string) becomes
// its own bullet, and a leading "Label:" segment (if present) is bolded to
// set it apart from the rest of the line (feedback, 2026-08-05: "the item
// should probably be somehow set apart from the description, which is less
// important"). A line with no colon — a general note with no natural
// "item" shape, e.g. a sibling discount — renders as a plain, un-bolded
// bullet instead of forcing structure onto it.
function LabeledBulletList({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return (
    <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
      {lines.map((line) => {
        const colonIndex = line.indexOf(':')
        return (
          <li key={line} style={{ marginBottom: 4 }}>
            {colonIndex === -1 ? line : (
              <>
                <strong>{line.slice(0, colonIndex)}</strong>
                {line.slice(colonIndex)}
              </>
            )}
          </li>
        )
      })}
    </ul>
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

  const details = camp ? campDetailsLine(camp) : null

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
            <p style={FACT_LINE_STYLE}>{timeLabel(camp.start_time, camp.end_time)}</p>
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
            {camp.price_details && (
              <>
                <h2>Options</h2>
                <LabeledBulletList text={camp.price_details} />
              </>
            )}
            {camp.prep_instructions && (
              <>
                <h2>What to bring / prepare</h2>
                <LabeledBulletList text={camp.prep_instructions} />
              </>
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
