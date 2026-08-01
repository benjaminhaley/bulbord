import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { formatDate } from '../format'
import { fetchEventSource, type EventSourceDetail } from './api'

export function SourceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [source, setSource] = useState<EventSourceDetail | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setSource(null)
    setError(false)
    fetchEventSource(id)
      .then(setSource)
      .catch(() => setError(true))
  }, [id])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/event-sources" />
          </IonButtons>
          <IonTitle>{source?.name ?? 'Source'}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!source && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this source</p>
          </div>
        )}
        {source && (
          <>
            {source.is_stale && <IonBadge color="warning">Likely stale — no new events found recently</IonBadge>}
            <p>
              {source.last_event_added_at
                ? `Last new event added ${formatDate(source.last_event_added_at)}`
                : 'No events identified yet from this source'}
            </p>
            {source.notes && <p>{source.notes}</p>}
            <IonButton expand="block" href={source.url} target="_blank" rel="noreferrer">
              Visit source
            </IonButton>
            <IonList inset>
              <IonListHeader>
                <IonLabel>Events from this source ({source.events.length})</IonLabel>
              </IonListHeader>
              {source.events.length === 0 && (
                <IonItem lines="none">
                  <IonLabel color="medium">None yet</IonLabel>
                </IonItem>
              )}
              {source.events.map((event) => (
                <IonItem key={event.id} routerLink={`/events/${event.id}`}>
                  <IonLabel>
                    <h2>{event.title}</h2>
                    <IonNote>{formatDate(event.start_date)}</IonNote>
                  </IonLabel>
                  {event.status !== 'approved' && <IonBadge color="medium">{event.status}</IonBadge>}
                </IonItem>
              ))}
            </IonList>
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
