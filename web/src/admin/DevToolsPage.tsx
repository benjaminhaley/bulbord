import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { eyeOutline, mailOutline, peopleOutline } from 'ionicons/icons'
import { useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import { sendTestNewsletterEmail } from './api'

// Reachable only by tapping your own avatar a second time, on the Account
// page (see AccountPage.tsx) — a deliberately low-visibility entry point
// since only Ben (the sole admin) needs these tools (feedback #38).
export function DevToolsPage() {
  const { user } = useAuth()
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function sendTest() {
    setSending(true)
    try {
      await sendTestNewsletterEmail()
      setToast(`Sent to ${user?.email ?? 'your email'}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not send test email')
    } finally {
      setSending(false)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/account" />
          </IonButtons>
          <IonTitle>Developer Tools</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonList inset>
          <IonItem button disabled={sending} onClick={sendTest}>
            <IonIcon slot="start" icon={mailOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Send yourself a test newsletter email</h2>
              <p>This week's real events, using the same template as the live send — sent only to you.</p>
            </IonLabel>
            {sending && <IonSpinner slot="end" name="dots" />}
          </IonItem>
          <IonItem button routerLink="/admin/invite-preview">
            <IonIcon slot="start" icon={eyeOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Preview the invite page</h2>
              <p>See what a new member sees after tapping your invite QR code.</p>
            </IonLabel>
          </IonItem>
          <IonItem button routerLink="/admin/users" lines="none">
            <IonIcon slot="start" icon={peopleOutline} />
            <IonLabel>All members</IonLabel>
          </IonItem>
        </IonList>
      </IonContent>
      <IonToast isOpen={!!toast} message={toast ?? ''} duration={3000} onDidDismiss={() => setToast(null)} />
    </IonPage>
  )
}
