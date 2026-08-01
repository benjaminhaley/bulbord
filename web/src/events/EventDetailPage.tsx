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
import { star, starOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { API_URL } from '../config'
import { fetchEvent, type Event } from './api'
import { formatWhen } from './format'
import { InterestedBadge } from './InterestedBadge'
import { useEventInterest } from './useEventInterest'

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [error, setError] = useState(false)
  const { pending: interestPending, setInterest, clearInterest } = useEventInterest(setEvent)

  function toggleInterest() {
    if (!event) return
    if (event.interest_status === 'interested') {
      clearInterest(event)
    } else {
      setInterest(event, 'interested')
    }
  }

  useEffect(() => {
    setEvent(null)
    setError(false)
    fetchEvent(id)
      .then(setEvent)
      .catch(() => setError(true))
  }, [id])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/events" />
          </IonButtons>
          <IonTitle>{event?.title ?? 'Event'}</IonTitle>
          {event && (
            <IonButtons slot="end">
              <IonButton disabled={interestPending} onClick={toggleInterest}>
                <IonIcon
                  slot="icon-only"
                  icon={event.interest_status === 'interested' ? star : starOutline}
                  color={event.interest_status === 'interested' ? 'warning' : undefined}
                />
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!event && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this event</p>
          </div>
        )}
        {event && (
          <>
            {event.image_url && (
              <img
                src={`${API_URL}${event.image_url}`}
                alt=""
                style={{ width: '100%', borderRadius: 12, marginBottom: 16 }}
              />
            )}
            <h1>{event.title}</h1>
            <p>{formatWhen(event)}</p>
            {event.interested_count > 0 && <InterestedBadge eventId={event.id} count={event.interested_count} />}
            {event.location_name && <p>{event.location_name}</p>}
            {event.address && <p>{event.address}</p>}
            {event.description && <p>{event.description}</p>}
            {event.source_url && (
              <IonButton expand="block" href={event.source_url} target="_blank" rel="noreferrer">
                View source
              </IonButton>
            )}
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
