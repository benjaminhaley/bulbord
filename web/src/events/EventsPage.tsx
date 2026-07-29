import {
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { useEffect, useState } from 'react'

import { fetchEvents, type Event } from './api'

function formatWhen(event: Event): string {
  const date = new Date(`${event.start_date}T00:00:00`)
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (event.all_day || !event.start_time) {
    return dateLabel
  }

  const [hours, minutes] = event.start_time.split(':')
  const time = new Date()
  time.setHours(Number(hours), Number(minutes))
  const timeLabel = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return `${dateLabel} · ${timeLabel}`
}

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
              <IonItem key={event.id} href={event.source_url ?? undefined} target="_blank" rel="noreferrer">
                <IonLabel>
                  <h2>{event.title}</h2>
                  <p>{formatWhen(event)}</p>
                  {event.address && <IonNote>{event.address}</IonNote>}
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
