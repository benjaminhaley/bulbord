import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonList,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { closeOutline, personCircleOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'

import { formatRelativeDateTime } from '../format'
import { secondaryTextStyle } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { dismissNotification, fetchNotifications, type NotificationItem } from './api'

// Feedback #100: "click on my profile, you should be able to quickly see a
// set of notifications that when clicked become dismissed or there's a
// little X where you can dismiss them when you click them, they should
// lead exactly to the correct place." Tapping a row's own content both
// navigates to targetPath and dismisses it (the "when clicked become
// dismissed" reading) — the separate X is for clearing one without
// visiting it. Replaces InstitutionBanner's avatar -> /account default (see
// App.tsx/InstitutionBanner.tsx); Account is still reachable via the
// person icon in this page's own header.
export function NotificationsPage() {
  const history = useHistory()
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissingId, setDismissingId] = useState<string | null>(null)

  useEffect(() => {
    fetchNotifications()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load notifications'))
  }, [])

  function removeLocally(id: string) {
    setItems((prev) => prev?.filter((n) => n.id !== id) ?? prev)
  }

  async function handleOpen(item: NotificationItem) {
    history.push(item.target_path)
    if (!item.dismissed_at) {
      removeLocally(item.id)
      dismissNotification(item.id).catch((err) => console.error('failed to dismiss notification', err))
    }
  }

  async function handleDismiss(item: NotificationItem) {
    setDismissingId(item.id)
    try {
      await dismissNotification(item.id)
      removeLocally(item.id)
    } catch (err) {
      console.error('failed to dismiss notification', err)
    } finally {
      setDismissingId(null)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/events" />
          </IonButtons>
          <IonTitle>Notifications</IonTitle>
          <IonButtons slot="end">
            <IonButton routerLink="/account" aria-label="Account">
              <IonIcon slot="icon-only" icon={personCircleOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!items && !error && <IonSpinner name="dots" />}
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}
        {items && items.length === 0 && <p style={secondaryTextStyle}>No notifications yet.</p>}
        {items && items.length > 0 && (
          <IonList inset>
            {items.map((item) => (
              <IonItem key={item.id} lines="full">
                <div
                  role="button"
                  onClick={() => handleOpen(item)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', padding: '10px 0' }}
                >
                  <Avatar url={item.actor_avatar_url} name={item.actor_name ?? 'Bulbord'} size={36} />
                  <div>
                    <p style={{ margin: 0, fontWeight: item.dismissed_at ? 400 : 600 }}>{item.message}</p>
                    <p style={{ ...secondaryTextStyle, margin: 0 }}>{formatRelativeDateTime(item.created_at)}</p>
                  </div>
                </div>
                {!item.dismissed_at && (
                  <IonButton
                    slot="end"
                    fill="clear"
                    disabled={dismissingId === item.id}
                    onClick={() => handleDismiss(item)}
                    aria-label="Dismiss"
                  >
                    <IonIcon slot="icon-only" icon={closeOutline} />
                  </IonButton>
                )}
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
