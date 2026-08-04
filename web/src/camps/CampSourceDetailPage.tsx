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
import { fetchCampSource, type CampSourceDetail } from './api'
import { formatDateRange } from './format'

export function CampSourceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [source, setSource] = useState<CampSourceDetail | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setSource(null)
    setError(false)
    fetchCampSource(id)
      .then(setSource)
      .catch(() => setError(true))
  }, [id])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/camp-sources" />
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
            {source.is_stale && <IonBadge color="warning">Likely stale — no new camps found recently</IonBadge>}
            <p>
              {source.last_camp_added_at
                ? `Last new camp added ${formatDate(source.last_camp_added_at)}`
                : 'No camps identified yet from this source'}
            </p>
            {source.notes && <p>{source.notes}</p>}
            <p>
              <strong>{source.camp_count}</strong> currently shown in the app (approved and upcoming)
            </p>
            <IonButton expand="block" href={source.url} target="_blank" rel="noreferrer">
              Visit source
            </IonButton>
            <IonList inset>
              <IonListHeader>
                <IonLabel>Upcoming camps from this source ({source.camps.length})</IonLabel>
              </IonListHeader>
              {source.camps.length === 0 && (
                <IonItem lines="none">
                  <IonLabel color="medium">Nothing upcoming</IonLabel>
                </IonItem>
              )}
              {source.camps.map((camp) => (
                <IonItem key={camp.id} routerLink={`/camps/${camp.id}`}>
                  <IonLabel>
                    <h2>{camp.title}</h2>
                    <IonNote>{formatDateRange(camp.start_date, camp.end_date)}</IonNote>
                  </IonLabel>
                  {camp.status !== 'approved' && <IonBadge color="medium">{camp.status}</IonBadge>}
                </IonItem>
              ))}
            </IonList>
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
