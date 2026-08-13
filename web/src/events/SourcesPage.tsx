import {
  IonBackButton,
  IonButtons,
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

import { fetchEventSources, type EventSource } from './api'

export function SourcesPage() {
  const [sources, setSources] = useState<EventSource[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchEventSources()
      .then(setSources)
      .catch(() => setError(true))
  }, [])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/events" />
          </IonButtons>
          <IonTitle>Sources</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        {/* A brief scope guide for whoever (human or AI) is deciding what belongs
            here — feedback #71: the sources list itself doesn't otherwise say
            what makes an event appropriate to add. */}
        <p className="ion-padding-horizontal ion-padding-top" style={{ color: 'var(--ion-color-medium)' }}>
          Events for the Nettelhorst community. The ideal event is close to the school, open to the community, and
          focused on people, not profit — think about what families are talking about when they drop their kids off.
          Those are the events that belong here.
        </p>
        {sources === null && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load sources</p>
          </div>
        )}
        {sources !== null && sources.length > 0 && (
          <IonList>
            {sources.map((source) => (
              <IonItem key={source.id} routerLink={`/event-sources/${source.id}`}>
                <IonLabel>
                  <h2>{source.name}</h2>
                  <IonNote>{source.url}</IonNote>
                </IonLabel>
                <IonNote slot="end">{source.event_count}</IonNote>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
