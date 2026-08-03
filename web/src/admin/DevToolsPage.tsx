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
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { eyeOutline, mailOutline, peopleOutline, refreshOutline } from 'ionicons/icons'
import { useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import { resourceEventSources, sendTestNewsletterEmail, type ResourceReport } from './api'

// Reachable only by tapping your own avatar a second time, on the Account
// page (see AccountPage.tsx) — a deliberately low-visibility entry point
// since only Ben (the sole admin) needs these tools (feedback #38).
export function DevToolsPage() {
  const { user } = useAuth()
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [resourcing, setResourcing] = useState(false)
  const [report, setReport] = useState<ResourceReport | null>(null)

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

  async function resource() {
    setResourcing(true)
    setReport(null)
    try {
      const result = await resourceEventSources()
      setReport(result)
      setToast(`Checked ${result.sources_checked} source(s), added ${result.total_added} event(s)`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not re-run sourcing')
    } finally {
      setResourcing(false)
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
          <IonItem button routerLink="/admin/users">
            <IonIcon slot="start" icon={peopleOutline} />
            <IonLabel>All members</IonLabel>
          </IonItem>
          <IonItem button disabled={resourcing} onClick={resource} lines="none">
            <IonIcon slot="start" icon={refreshOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Re-run event sourcing</h2>
              <p>Re-check every active source for new or updated events and report what was added.</p>
            </IonLabel>
            {resourcing && <IonSpinner slot="end" name="dots" />}
          </IonItem>
        </IonList>
        {report && (
          <IonList inset>
            {report.results.map((r) => (
              <IonItem key={r.source_id} lines="full">
                <IonLabel className="ion-text-wrap">
                  <h2>{r.name}</h2>
                  <IonNote color={r.error ? 'danger' : 'medium'}>
                    {r.error ?? `${r.added} added, ${r.skipped} already known`}
                  </IonNote>
                </IonLabel>
              </IonItem>
            ))}
            {report.results.length === 0 && (
              <IonItem lines="none">
                <IonLabel color="medium">No active sources to check</IonLabel>
              </IonItem>
            )}
          </IonList>
        )}
      </IonContent>
      <IonToast isOpen={!!toast} message={toast ?? ''} duration={3000} onDidDismiss={() => setToast(null)} />
    </IonPage>
  )
}
