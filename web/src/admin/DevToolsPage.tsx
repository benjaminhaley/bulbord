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
import { alertCircle, eyeOutline, mailOutline, peopleOutline, refreshOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { formatRelativeDateTime } from '../format'
import { useAuth } from '../auth/AuthContext'
import { useDataFreshness } from './DataFreshnessContext'
import { fetchSourcesLastCheckedAt, resourceEventSources, sendTestNewsletterEmail, type ResourceReport } from './api'

// A week with no refresh is the same threshold the admin avatar badge uses
// (see admin/DataFreshnessContext.tsx's server-side STALE_AFTER_MS) — kept
// here too so this page's own red markers agree with the badge that sent
// the admin here in the first place.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
function isStale(iso: string | null): boolean {
  return iso === null || Date.now() - new Date(iso).getTime() > STALE_AFTER_MS
}

// Reachable only by tapping your own avatar a second time, on the Account
// page (see AccountPage.tsx) — a deliberately low-visibility entry point
// since only Ben (the sole admin) needs these tools (feedback #38).
export function DevToolsPage() {
  const { user } = useAuth()
  const { freshness, refresh: refreshFreshness } = useDataFreshness()
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [resourcing, setResourcing] = useState(false)
  const [report, setReport] = useState<ResourceReport | null>(null)
  // Kept as its own state (rather than reading straight off `freshness`)
  // because resource() below needs to update it optimistically from the
  // POST response, before a fresh GET /admin/data-freshness round-trip
  // would land.
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)

  useEffect(() => {
    fetchSourcesLastCheckedAt()
      .then(setLastCheckedAt)
      .catch(() => {})
  }, [])

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
      setLastCheckedAt(result.last_checked_at)
      refreshFreshness().catch(() => {})
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
              <h2>Preview the sign-up flow</h2>
              <p>Walk through what a new member sees, from tapping your invite QR code through setting up their profile.</p>
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
              <p>
                Last checked: {lastCheckedAt ? formatRelativeDateTime(lastCheckedAt) : 'never'}
                {isStale(lastCheckedAt) && <IonIcon icon={alertCircle} color="danger" style={{ verticalAlign: '-2px', marginInlineStart: 4 }} />}
              </p>
            </IonLabel>
            {resourcing && <IonSpinner slot="end" name="dots" />}
          </IonItem>
          <IonItem lines="none">
            <IonLabel className="ion-text-wrap">
              <h2>Camps data</h2>
              <p>Camps are hand-researched, not auto-sourced — this just tracks when it was last refreshed.</p>
              <p>
                Last updated:{' '}
                {freshness?.camps_last_updated_at ? formatRelativeDateTime(freshness.camps_last_updated_at) : 'never'}
                {isStale(freshness?.camps_last_updated_at ?? null) && (
                  <IonIcon icon={alertCircle} color="danger" style={{ verticalAlign: '-2px', marginInlineStart: 4 }} />
                )}
              </p>
            </IonLabel>
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
