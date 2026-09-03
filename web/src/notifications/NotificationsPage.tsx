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
import { closeOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'

import { type DataFreshness } from '../admin/api'
import { useDataFreshness } from '../admin/DataFreshnessContext'
import { useAuth } from '../auth/AuthContext'
import { formatRelativeDateTime } from '../format'
import { secondaryTextStyle } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { dismissNotification, fetchNotifications, type NotificationItem } from './api'

// Feedback #132: the admin-only "events/camps data needs attention" nudge
// used to be its own amber dot on the avatar — now it's a real row here,
// so the one red bell badge (see InstitutionBanner.tsx) always leads
// somewhere that actually explains itself, the same way a real
// notification does. Not a DB row (it's live computed state, not a
// discrete past event), so it gets a synthetic id and skips the
// dismiss-via-API path below — it simply stops appearing once the
// underlying data is refreshed.
const FRESHNESS_ALERT_ID = 'data-freshness-alert'

export function describeFreshnessAlert(freshness: DataFreshness | null): string | null {
  if (!freshness) return null
  const lowCount = freshness.recurring_series_running_low.length
  const parts: string[] = []
  if (freshness.is_stale) parts.push('Events/camps data needs a refresh')
  if (lowCount > 0) {
    parts.push(`${lowCount} recurring listing${lowCount === 1 ? '' : 's'} running low on confirmed dates`)
  }
  return parts.length > 0 ? parts.join(' — ') : null
}

// Feedback #100: "click on my profile, you should be able to quickly see a
// set of notifications that when clicked become dismissed or there's a
// little X where you can dismiss them when you click them, they should
// lead exactly to the correct place." Tapping a row's own content both
// navigates to targetPath and dismisses it (the "when clicked become
// dismissed" reading) — the separate X is for clearing one without
// visiting it. Reached via its own bell icon in `InstitutionBanner`, not
// the avatar — Account is a separate, direct entry point (feedback,
// 2026-08-17: overloading the avatar to mean "notifications first" read as
// "confusing and buried... follow more conventional [apps] like Facebook,"
// which keeps a bell and a profile photo as two separate top-bar icons).
export function NotificationsPage() {
  const history = useHistory()
  // Dismissing here doesn't just need to update this page's own list — the
  // bell badge on InstitutionBanner reads `user.unseenNotificationCount`
  // straight off AuthContext, so a dismissal has to trigger a `refresh()`
  // or that badge stays stuck at its old count until something else
  // happens to refetch /auth/me (found live, 2026-08-17: "I closed all the
  // notifications, but my ringer number still reads four" — the server-side
  // count was already correctly 0). Safe to call from here per the
  // documented refresh()/isLoading incident (see Connections in
  // CLAUDE.md) — this page only ever renders once `user` is already
  // loaded, so refresh() never touches the global spinner.
  const { refresh, isAdmin } = useAuth()
  const { freshness } = useDataFreshness()
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissingId, setDismissingId] = useState<string | null>(null)

  useEffect(() => {
    fetchNotifications()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load notifications'))
  }, [])

  const freshnessAlert = isAdmin ? describeFreshnessAlert(freshness) : null
  const displayItems: NotificationItem[] | null = items
    ? [
        ...(freshnessAlert
          ? [
              {
                id: FRESHNESS_ALERT_ID,
                type: 'data_freshness',
                message: freshnessAlert,
                target_path: '/admin/dev-tools',
                actor_name: null,
                actor_avatar_url: null,
                created_at: new Date().toISOString(),
                dismissed_at: null,
              } satisfies NotificationItem,
            ]
          : []),
        ...items,
      ]
    : null

  function removeLocally(id: string) {
    setItems((prev) => prev?.filter((n) => n.id !== id) ?? prev)
  }

  async function handleOpen(item: NotificationItem) {
    history.push(item.target_path)
    if (item.id === FRESHNESS_ALERT_ID) return
    if (!item.dismissed_at) {
      removeLocally(item.id)
      dismissNotification(item.id)
        .then(refresh)
        .catch((err) => console.error('failed to dismiss notification', err))
    }
  }

  async function handleDismiss(item: NotificationItem) {
    setDismissingId(item.id)
    try {
      await dismissNotification(item.id)
      removeLocally(item.id)
      await refresh()
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
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!displayItems && !error && <IonSpinner name="dots" />}
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}
        {displayItems && displayItems.length === 0 && <p style={secondaryTextStyle}>No notifications yet.</p>}
        {displayItems && displayItems.length > 0 && (
          <IonList inset>
            {displayItems.map((item) => {
              const isFreshnessAlert = item.id === FRESHNESS_ALERT_ID
              return (
                <IonItem key={item.id} button lines="full" detail={false} onClick={() => handleOpen(item)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, padding: '10px 0' }}>
                    <Avatar url={item.actor_avatar_url} name={item.actor_name ?? 'Bulbord'} size={36} />
                    <div>
                      <p style={{ margin: 0, fontWeight: item.dismissed_at ? 400 : 600 }}>{item.message}</p>
                      <p style={{ ...secondaryTextStyle, margin: 0 }}>
                        {isFreshnessAlert ? 'Admin alert' : formatRelativeDateTime(item.created_at)}
                      </p>
                    </div>
                  </div>
                  {!item.dismissed_at && !isFreshnessAlert && (
                    <IonButton
                      slot="end"
                      fill="clear"
                      disabled={dismissingId === item.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDismiss(item)
                      }}
                      aria-label="Dismiss"
                    >
                      <IonIcon slot="icon-only" icon={closeOutline} />
                    </IonButton>
                  )}
                </IonItem>
              )
            })}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
