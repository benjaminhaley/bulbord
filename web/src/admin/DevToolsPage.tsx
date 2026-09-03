import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import {
  alarmOutline,
  alertCircle,
  analyticsOutline,
  eyeOutline,
  flaskOutline,
  globeOutline,
  mailOutline,
  peopleOutline,
  personAddOutline,
  refreshOutline,
  ribbonOutline,
  sunnyOutline,
  timeOutline,
} from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { formatDate, formatRelativeDateTime } from '../format'
import { useAuth } from '../auth/AuthContext'
import { useDataFreshness } from './DataFreshnessContext'
import {
  createTestFriendRequest,
  fetchSourcesLastCheckedAt,
  resourceEventSources,
  sendTestCampReminderEmail,
  sendTestConnectionAlertEmail,
  sendTestNewsletterEmail,
  testEmailIngest,
  type ResourceReport,
} from './api'

// A week with no refresh is the same threshold the admin avatar badge uses
// (see admin/DataFreshnessContext.tsx's server-side STALE_AFTER_MS) — kept
// here too so this page's own red markers agree with the badge that sent
// the admin here in the first place.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
function isStale(iso: string | null): boolean {
  return iso === null || Date.now() - new Date(iso).getTime() > STALE_AFTER_MS
}

// Feedback #119: "N days overdue" once the last known occurrence has
// already passed (the more urgent case — a member could be looking at a
// gap right now), "due in N days" while there's still a little runway left
// but less than the series' own typical gap between occurrences.
function runwayLabel(daysUntilLastOccurrence: number): string {
  if (daysUntilLastOccurrence < 0) return `${Math.abs(daysUntilLastOccurrence)} day${daysUntilLastOccurrence === -1 ? '' : 's'} overdue`
  if (daysUntilLastOccurrence === 0) return 'last occurrence is today'
  return `due in ${daysUntilLastOccurrence} day${daysUntilLastOccurrence === 1 ? '' : 's'}`
}

// Reachable only by tapping your own avatar a second time, on the Account
// page (see AccountPage.tsx) — a deliberately low-visibility entry point
// since only Ben (the sole admin) needs these tools (feedback #38).
export function DevToolsPage() {
  const { user, refresh } = useAuth()
  const { freshness, refresh: refreshFreshness } = useDataFreshness()
  const [sending, setSending] = useState(false)
  const [sendingCampReminderTest, setSendingCampReminderTest] = useState(false)
  const [sendingConnectionTest, setSendingConnectionTest] = useState(false)
  const [creatingTestRequest, setCreatingTestRequest] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [resourcing, setResourcing] = useState(false)
  const [report, setReport] = useState<ResourceReport | null>(null)
  const [emailIngestOpen, setEmailIngestOpen] = useState(false)
  const [emailIngestFrom, setEmailIngestFrom] = useState('')
  const [emailIngestSubject, setEmailIngestSubject] = useState('')
  const [emailIngestBody, setEmailIngestBody] = useState('')
  const [testingEmailIngest, setTestingEmailIngest] = useState(false)
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

  async function sendCampReminderTest() {
    setSendingCampReminderTest(true)
    try {
      await sendTestCampReminderEmail()
      setToast(`Sent to ${user?.email ?? 'your email'}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not send test email')
    } finally {
      setSendingCampReminderTest(false)
    }
  }

  async function sendConnectionTest() {
    setSendingConnectionTest(true)
    try {
      await sendTestConnectionAlertEmail()
      setToast(`Sent to ${user?.email ?? 'your email'}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not send test email')
    } finally {
      setSendingConnectionTest(false)
    }
  }

  async function createFriendRequest() {
    setCreatingTestRequest(true)
    try {
      const testUser = await createTestFriendRequest()
      // Updates the avatar dot/count immediately, same as visiting Friends
      // would — otherwise it'd only show up on this page's next real
      // GET /auth/me (the next navigation).
      await refresh()
      setToast(`Created "${testUser.name}" — check your alert email and the notification bell, then Accept/Decline it from Friends. Delete it from All members when done.`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not create test friend request')
    } finally {
      setCreatingTestRequest(false)
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

  async function runEmailIngestTest() {
    setTestingEmailIngest(true)
    try {
      const result = await testEmailIngest({ fromAddress: emailIngestFrom, subject: emailIngestSubject, body: emailIngestBody })
      setToast(`Added ${result.added} event(s), skipped ${result.skipped} duplicate(s)`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not test email ingest')
    } finally {
      setTestingEmailIngest(false)
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
        {/* Feedback #125 ("organize developer tools... hodgepodge"): grouped
            into three sections by what kind of task each item serves,
            rather than one flat list of everything — a member/oversight
            group, a content-pipeline group, and a dev/QA-utility group,
            roughly ordered least-to-most technical. */}
        <IonList inset>
          <IonListHeader>
            <IonLabel>Members & Analytics</IonLabel>
          </IonListHeader>
          <IonItem button routerLink="/admin/users">
            <IonIcon slot="start" icon={peopleOutline} />
            <IonLabel>All members</IonLabel>
          </IonItem>
          <IonItem button routerLink="/admin/analytics" lines="none">
            <IonIcon slot="start" icon={analyticsOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Analytics</h2>
              <p>Daily active members, who's viewing/sharing, and a recent activity log.</p>
            </IonLabel>
          </IonItem>
        </IonList>
        <IonList inset>
          <IonListHeader>
            <IonLabel>Sourcing & Data</IonLabel>
          </IonListHeader>
          <IonItem button disabled={resourcing} onClick={resource}>
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
          {/* Feedback #115: paste in an email's text and run it through the
              real extraction/ingestion pipeline — works today even before
              the real inbound-email webhook (Resend receiving domain + DNS)
              is set up, and doubles as a repeatable way to test it after. */}
          <IonItem button onClick={() => setEmailIngestOpen((open) => !open)}>
            <IonIcon slot="start" icon={mailOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Test email-based event ingestion</h2>
              <p>Paste in an email's text and see what events get extracted, same pipeline a forwarded email will use.</p>
            </IonLabel>
          </IonItem>
          {emailIngestOpen && (
            <>
              <IonItem>
                <IonInput
                  label="From address"
                  labelPlacement="stacked"
                  placeholder="newsletter@example.org"
                  value={emailIngestFrom}
                  onIonInput={(e) => setEmailIngestFrom(e.detail.value ?? '')}
                />
              </IonItem>
              <IonItem>
                <IonInput
                  label="Subject"
                  labelPlacement="stacked"
                  placeholder="This week's events"
                  value={emailIngestSubject}
                  onIonInput={(e) => setEmailIngestSubject(e.detail.value ?? '')}
                />
              </IonItem>
              <IonItem>
                <IonTextarea
                  label="Body"
                  labelPlacement="stacked"
                  placeholder="Paste the email's text here..."
                  autoGrow
                  value={emailIngestBody}
                  onIonInput={(e) => setEmailIngestBody(e.detail.value ?? '')}
                />
              </IonItem>
              <IonItem lines="none">
                <IonButton
                  disabled={testingEmailIngest || !emailIngestFrom.trim() || !emailIngestBody.trim()}
                  onClick={runEmailIngestTest}
                >
                  Run
                </IonButton>
                {testingEmailIngest && <IonSpinner slot="end" name="dots" />}
              </IonItem>
            </>
          )}
          {/* Feedback (2026-08-17, "consolidate these icons"): sources used
              to be one tap away from the Events tab itself (a standalone
              list icon) — moved here since adding one is now admin-only.
              Renamed "Manage sources" → "Manage event sources" once Camps
              got the same treatment (feedback #102 follow-up) and there
              were two of these. */}
          <IonItem button routerLink="/event-sources">
            <IonIcon slot="start" icon={globeOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Manage event sources</h2>
              <p>View existing event sources, or add a new one.</p>
            </IonLabel>
          </IonItem>
          <IonItem button routerLink="/camp-sources">
            <IonIcon slot="start" icon={globeOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Manage camp sources</h2>
              <p>View existing camp sources, or add a new one.</p>
            </IonLabel>
          </IonItem>
          <IonItem button routerLink="/sports-club-sources">
            <IonIcon slot="start" icon={ribbonOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Manage sports & clubs sources</h2>
              <p>View existing sports/clubs sources, or add a new one.</p>
            </IonLabel>
          </IonItem>
          <IonItem lines="none">
            <IonIcon slot="start" icon={sunnyOutline} />
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
        <IonList inset>
          <IonListHeader>
            <IonLabel>Test & Preview Tools</IonLabel>
          </IonListHeader>
          <IonItem button routerLink="/admin/invite-preview">
            <IonIcon slot="start" icon={eyeOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Preview the sign-up flow</h2>
              <p>Walk through what a new member sees, from tapping your invite QR code through setting up their profile.</p>
            </IonLabel>
          </IonItem>
          <IonItem button disabled={sending} onClick={sendTest}>
            <IonIcon slot="start" icon={mailOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Send yourself a test newsletter email</h2>
              <p>This week's real events, using the same template as the live send — sent only to you.</p>
            </IonLabel>
            {sending && <IonSpinner slot="end" name="dots" />}
          </IonItem>
          <IonItem button disabled={sendingCampReminderTest} onClick={sendCampReminderTest}>
            <IonIcon slot="start" icon={alarmOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Send yourself a test day-off camp reminder email</h2>
              <p>The soonest upcoming school break with camps listed, same template as the real 28-days-before send.</p>
            </IonLabel>
            {sendingCampReminderTest && <IonSpinner slot="end" name="dots" />}
          </IonItem>
          <IonItem button disabled={sendingConnectionTest} onClick={sendConnectionTest}>
            <IonIcon slot="start" icon={personAddOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Send yourself a test friend-request email</h2>
              <p>The real "sent you a friend request" alert (using your own name/photo), same template as the live send.</p>
            </IonLabel>
            {sendingConnectionTest && <IonSpinner slot="end" name="dots" />}
          </IonItem>
          <IonItem button disabled={creatingTestRequest} onClick={createFriendRequest} lines="none">
            <IonIcon slot="start" icon={flaskOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Create a test friend request</h2>
              <p>A real throwaway member sends you a friend request — the actual alert email and in-app notification, testable end-to-end against the real Accept/Decline buttons, repeatable anytime. Delete it from All members after.</p>
            </IonLabel>
            {creatingTestRequest && <IonSpinner slot="end" name="dots" />}
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
        {/* Feedback #119: auto-surfaced (no button — freshness already loads
            for every admin via DataFreshnessProvider), rather than something
            Ben has to remember to click and check. Root cause was the
            Nettelhorst French Market going silently stale with nothing to
            notice — see api/src/events/recurring-series-health.ts. */}
        {(freshness?.recurring_series_running_low.length ?? 0) > 0 && (
          <IonList inset>
            <IonListHeader>
              <IonLabel>Recurring listings running low</IonLabel>
            </IonListHeader>
            <IonItem lines="full">
              <IonNote className="ion-text-wrap" color="medium">
                These have a real recurring history but no confirmed occurrence coming up soon — worth a re-check.
              </IonNote>
            </IonItem>
            {freshness!.recurring_series_running_low.map((series) => (
              <IonItem
                key={series.title}
                lines="full"
                button={!!series.source_id}
                routerLink={series.source_id ? `/event-sources/${series.source_id}` : undefined}
              >
                <IonIcon slot="start" icon={timeOutline} color="warning" />
                <IonLabel className="ion-text-wrap">
                  <h2>{series.title}</h2>
                  <IonNote color="medium">
                    Last: {formatDate(`${series.last_occurrence_date}T00:00:00`)} ({runwayLabel(series.days_until_last_occurrence)}) ·{' '}
                    {series.occurrence_count} occurrences seen · {series.source_name ?? 'no source'}
                  </IonNote>
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
      <IonToast isOpen={!!toast} message={toast ?? ''} duration={3000} onDidDismiss={() => setToast(null)} />
    </IonPage>
  )
}
