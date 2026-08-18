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
import { fetchSportsClubSource, type SportsClubSourceDetail } from './api'
import { scheduleSummary } from './format'

export function SportsClubSourceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [source, setSource] = useState<SportsClubSourceDetail | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setSource(null)
    setError(false)
    fetchSportsClubSource(id)
      .then(setSource)
      .catch(() => setError(true))
  }, [id])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/sports-club-sources" />
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
            {source.is_stale && <IonBadge color="warning">Likely stale — nothing new found recently</IonBadge>}
            <p>
              {source.last_sports_club_added_at
                ? `Last new listing added ${formatDate(source.last_sports_club_added_at)}`
                : 'No listings identified yet from this source'}
            </p>
            {source.notes && <p>{source.notes}</p>}
            <p>
              <strong>{source.sports_club_count}</strong> currently shown in the app (approved and current)
            </p>
            <IonButton expand="block" href={source.url} target="_blank" rel="noreferrer">
              Visit source
            </IonButton>
            <IonList inset>
              <IonListHeader>
                <IonLabel>Listings from this source ({source.sports_clubs.length})</IonLabel>
              </IonListHeader>
              {source.sports_clubs.length === 0 && (
                <IonItem lines="none">
                  <IonLabel color="medium">Nothing yet</IonLabel>
                </IonItem>
              )}
              {source.sports_clubs.map((club) => (
                <IonItem key={club.id} routerLink={`/sports-clubs/${club.id}`}>
                  <IonLabel>
                    <h2>{club.title}</h2>
                    <IonNote>{scheduleSummary(club)}</IonNote>
                  </IonLabel>
                  {club.status !== 'approved' && <IonBadge color="medium">{club.status}</IonBadge>}
                </IonItem>
              ))}
            </IonList>
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
