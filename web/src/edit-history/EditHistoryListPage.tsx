import {
  IonBackButton,
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
import { cogOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { formatRelativeDateTime } from '../format'
import { Avatar } from '../uploads/Avatar'
import { fetchEditHistory, type EditHistoryListItem } from './api'
import type { EntityType } from './types'

// Feedback #141 (2026-09-07): "history should appear... can be kinda
// buried, but it should be visible" — reached via a small history icon on
// each entity's detail page toolbar, not a prominent nav item. Generic
// across events/camps/sports_clubs (same reasoning as the backend's shared
// entity_edits table/module — "list what changed and by whom" has no
// per-domain behavior to diverge on), so each entity gets a thin route
// wrapper (e.g. events/EventHistoryPage.tsx) supplying entityType/entityId/
// backHref/detailPathPrefix rather than three hand-copied list views.
export function EditHistoryListPage({
  entityType,
  entityId,
  title,
  backHref,
  detailPathPrefix,
}: {
  entityType: EntityType
  entityId: string
  title: string
  backHref: string
  // Tapping a row navigates to `${detailPathPrefix}/${entry.id}`.
  detailPathPrefix: string
}) {
  const [items, setItems] = useState<EditHistoryListItem[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setItems(null)
    setError(false)
    fetchEditHistory(entityType, entityId)
      .then(setItems)
      .catch(() => setError(true))
  }, [entityType, entityId])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={backHref} />
          </IonButtons>
          <IonTitle>History</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        {!items && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load history</p>
          </div>
        )}
        {items && items.length === 0 && (
          <div className="coming-soon">
            <p>No edits yet — changes to {title.toLowerCase()} will show up here.</p>
          </div>
        )}
        {items && items.length > 0 && (
          <IonList>
            {items.map((entry) => (
              <IonItem key={entry.id} routerLink={`${detailPathPrefix}/${entry.id}`} detail>
                {entry.actor.type === 'member' ? (
                  <Avatar url={entry.actor.avatar_url} name={entry.actor.name} size={36} slot="start" />
                ) : (
                  <IonIcon icon={cogOutline} slot="start" style={{ fontSize: '1.5rem', color: 'var(--ion-color-medium)' }} />
                )}
                <IonLabel>
                  <h2>{entry.actor.name}</h2>
                  <p>Changed: {entry.changed_fields.join(', ').replace(/_/g, ' ')}</p>
                </IonLabel>
                <IonNote slot="end">{formatRelativeDateTime(entry.created_at)}</IonNote>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
