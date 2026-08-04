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

import { fetchCampSources, type CampSource } from './api'

export function CampSourcesPage() {
  const [sources, setSources] = useState<CampSource[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchCampSources()
      .then(setSources)
      .catch(() => setError(true))
  }, [])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/camps" />
          </IonButtons>
          <IonTitle>Sources</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
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
              <IonItem key={source.id} routerLink={`/camp-sources/${source.id}`}>
                <IonLabel>
                  <h2>{source.name}</h2>
                  <IonNote>{source.url}</IonNote>
                </IonLabel>
                <IonNote slot="end">{source.camp_count}</IonNote>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
