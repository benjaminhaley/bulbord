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

import { useAuth } from '../auth/AuthContext'
import { API_URL } from '../config'
import { fetchEvent, type Event } from './api'
import { formatWhen } from './format'
import { useStarToggle } from './useStarToggle'

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [error, setError] = useState(false)
  const { pending: starPending, toggleStar } = useStarToggle(setEvent)

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
          {user && event && (
            <IonButtons slot="end">
              <IonButton disabled={starPending} onClick={() => toggleStar(event)}>
                <IonIcon slot="icon-only" icon={event.starred ? star : starOutline} color={event.starred ? 'warning' : undefined} />
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
