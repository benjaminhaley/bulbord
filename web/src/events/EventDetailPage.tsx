import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { fetchEvent, type Event } from './api'
import { formatWhen } from './format'

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [error, setError] = useState(false)

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
