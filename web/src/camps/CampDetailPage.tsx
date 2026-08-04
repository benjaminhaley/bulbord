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
import { campDetailsLine, formatDateRange } from './format'
import { InterestedBadge } from './InterestedBadge'
import { SourceNotesSection } from './SourceNotesSection'
import { useCampInterest } from './useCampInterest'

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
            <p>{formatDateRange(camp.start_date, camp.end_date)}</p>
            {camp.submitted_by && (
              <p style={{ color: 'var(--ion-color-medium)', marginTop: -8 }}>Posted by {camp.submitted_by.name}</p>
            )}
            {details !== null && <p>{details}</p>}
            {camp.interested_count > 0 && (
              <InterestedBadge campId={camp.id} count={camp.interested_count} people={camp.interested_people} />
            )}
            {camp.location_name && <p>{camp.location_name}</p>}
            {camp.address && <p>{camp.address}</p>}
            {camp.description && <p>{camp.description}</p>}
            {camp.booking_instructions && (
              <>
                <h2>Booking</h2>
                <p style={{ whiteSpace: 'pre-wrap' }}>{camp.booking_instructions}</p>
              </>
            )}
            {camp.prep_instructions && (
              <>
                <h2>What to bring / prepare</h2>
                <p style={{ whiteSpace: 'pre-wrap' }}>{camp.prep_instructions}</p>
              </>
            )}
            {camp.source_url && (
              <IonButton expand="block" href={camp.source_url} target="_blank" rel="noreferrer">
                View source
              </IonButton>
            )}
            <SourceNotesSection campId={camp.id} source={camp.source} />
            <CommentsSection campId={camp.id} />
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
