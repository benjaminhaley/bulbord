import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { listOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { fetchEvents, type Event } from './api'
import { formatWhen, teaser } from './format'

export function EventsPage() {
  const [events, setEvents] = useState<Event[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch(() => setError(true))
  }, [])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Events</IonTitle>
          <IonButtons slot="end">
            <IonButton routerLink="/event-sources">
              <IonIcon slot="icon-only" icon={listOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        {events === null && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Coming soon</p>
          </div>
        )}
        {events !== null && events.length === 0 && (
          <div className="coming-soon">
            <p>No upcoming events yet</p>
          </div>
        )}
        {events !== null && events.length > 0 && (
          <IonList>
            {events.map((event) => (
              <IonItem key={event.id} routerLink={`/events/${event.id}`}>
                <IonLabel>
                  <h2>{event.title}</h2>
                  <p>{formatWhen(event)}</p>
                  {event.address && <IonNote>{event.address}</IonNote>}
                  {teaser(event.description) && <p className="teaser">{teaser(event.description)}</p>}
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
