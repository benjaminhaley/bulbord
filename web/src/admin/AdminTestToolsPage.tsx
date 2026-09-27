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
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { alarmOutline, eyeOutline, flaskOutline, mailOutline, personAddOutline } from 'ionicons/icons'
import { useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import {
  createTestFriendRequest,
  sendTestCampReminderEmail,
  sendTestConnectionAlertEmail,
  sendTestNewsletterEmail,
  sendTestPipelineReviewEmail,
  testEmailIngest,
} from './api'

// Split out of DevToolsPage: everything here is a preview or a repeatable
// test action (real send-to-self emails, throwaway test data) rather than a
// routine admin task — none of it touches a real member's data, which is why
// it's fine to bury one level down instead of sharing the main page.
export function AdminTestToolsPage() {
  const { user, refresh } = useAuth()
  const [toast, setToast] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendingCampReminderTest, setSendingCampReminderTest] = useState(false)
  const [sendingConnectionTest, setSendingConnectionTest] = useState(false)
  const [sendingPipelineReviewTest, setSendingPipelineReviewTest] = useState(false)
  const [creatingTestRequest, setCreatingTestRequest] = useState(false)
  const [emailIngestOpen, setEmailIngestOpen] = useState(false)
  const [emailIngestFrom, setEmailIngestFrom] = useState('')
  const [emailIngestSubject, setEmailIngestSubject] = useState('')
  const [emailIngestBody, setEmailIngestBody] = useState('')
  const [testingEmailIngest, setTestingEmailIngest] = useState(false)

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

  async function sendPipelineReviewTest() {
    setSendingPipelineReviewTest(true)
    try {
      await sendTestPipelineReviewEmail()
      setToast(`Sent to ${user?.email ?? 'your email'}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not send test email')
    } finally {
      setSendingPipelineReviewTest(false)
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
            <IonBackButton defaultHref="/admin/dev-tools" />
          </IonButtons>
          <IonTitle>Test & Preview Tools</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonList inset>
          <IonListHeader>
            <IonLabel>Flow Previews</IonLabel>
          </IonListHeader>
          <IonItem button routerLink="/admin/invite-preview" lines="none">
            <IonIcon slot="start" icon={eyeOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Preview the sign-up flow</h2>
              <p>Walk through what a new member sees, from tapping your invite QR code through setting up their profile.</p>
            </IonLabel>
          </IonItem>
        </IonList>
        <IonList inset>
          <IonListHeader>
            <IonLabel>Test Emails</IonLabel>
          </IonListHeader>
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
          <IonItem button disabled={sendingPipelineReviewTest} onClick={sendPipelineReviewTest} lines="none">
            <IonIcon slot="start" icon={mailOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Send yourself a test pipeline review email</h2>
              <p>The current unreviewed kept/rejected candidates, same template as the real Wednesday send.</p>
            </IonLabel>
            {sendingPipelineReviewTest && <IonSpinner slot="end" name="dots" />}
          </IonItem>
        </IonList>
        <IonList inset>
          <IonListHeader>
            <IonLabel>Test Data</IonLabel>
          </IonListHeader>
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
          <IonItem button disabled={creatingTestRequest} onClick={createFriendRequest} lines="none">
            <IonIcon slot="start" icon={flaskOutline} />
            <IonLabel className="ion-text-wrap">
              <h2>Create a test friend request</h2>
              <p>A real throwaway member sends you a friend request — the actual alert email and in-app notification, testable end-to-end against the real Accept/Decline buttons, repeatable anytime. Delete it from All members after.</p>
            </IonLabel>
            {creatingTestRequest && <IonSpinner slot="end" name="dots" />}
          </IonItem>
        </IonList>
      </IonContent>
      <IonToast isOpen={!!toast} message={toast ?? ''} duration={3000} onDidDismiss={() => setToast(null)} />
    </IonPage>
  )
}
