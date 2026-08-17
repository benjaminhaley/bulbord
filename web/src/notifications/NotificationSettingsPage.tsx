import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/react'
import { useEffect, useState } from 'react'

import { fetchNotificationSettings, updateNotificationSettings, type NotificationSettings } from './api'

const ROWS: { key: keyof NotificationSettings; label: string; description: string }[] = [
  { key: 'friend_added_email', label: 'New followers', description: 'Someone starts following you.' },
  { key: 'feedback_reply_email', label: 'Feedback replies', description: 'Someone replies to feedback you posted.' },
  {
    key: 'content_comment_email',
    label: 'Event & camp comments',
    description: 'Someone comments on an event or camp you posted.',
  },
  { key: 'newsletter_email', label: 'Weekly newsletter', description: 'Camps, events, and community news — every Sunday night.' },
]

// Feedback #100: "in your settings, there should be notification settings,
// which indicate what notifications you'll be receiving by channel." Email
// is the only toggleable channel — the in-app notification list (see
// NotificationsPage.tsx) always includes every type regardless of these
// settings, since it's the notification inbox itself, not an optional
// channel.
export function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchNotificationSettings()
      .then(setSettings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load settings'))
  }, [])

  function toggle(key: keyof NotificationSettings, value: boolean) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
    updateNotificationSettings({ [key]: value }).catch((err) => {
      console.error('failed to update notification settings', err)
      setError('Could not save that change — try again.')
    })
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/account" />
          </IonButtons>
          <IonTitle>Notification Settings</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!settings && !error && <IonSpinner name="dots" />}
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}
        {settings && (
          <>
            <p>Choose which notifications you'll receive by email. Every notification always appears in your in-app Notifications list.</p>
            <IonList inset>
              {ROWS.map((row) => (
                <IonItem key={row.key} lines="full">
                  <IonLabel className="ion-text-wrap">
                    <h2>{row.label}</h2>
                    <p>{row.description}</p>
                  </IonLabel>
                  <IonToggle
                    slot="end"
                    checked={settings[row.key]}
                    onIonChange={(e) => toggle(row.key, e.detail.checked)}
                  />
                </IonItem>
              ))}
            </IonList>
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
