import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { copyOutline, logoGoogle, calendarOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

async function fetchFeedUrl(): Promise<string> {
  const response = await fetch(`${API_URL}/calendar/feed-url`, { headers: authHeaders() })
  if (!response.ok) throw new Error('Could not load your calendar link')
  const body = (await response.json()) as { data: { url: string } }
  return body.data.url
}

// Feedback #166: one subscription URL covering every event, camp, and
// Sports & Clubs listing the member has starred. A subscribed calendar
// re-polls it, so newly starred items show up on their own.
export function CalendarSyncPage() {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchFeedUrl()
      .then(setUrl)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your calendar link'))
  }, [])

  const webcalUrl = url?.replace(/^https?:/, 'webcal:')

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setError('Could not copy — press and hold the link to copy it instead.')
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/account" />
          </IonButtons>
          <IonTitle>Sync to Calendar</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        <p>
          Subscribe once and every event, camp, and club you've starred appears in your own calendar app — and stays up to
          date as you star more.
        </p>
        {!url && !error && <IonSpinner name="dots" />}
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}
        {url && webcalUrl && (
          <>
            <IonButton expand="block" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`} target="_blank" rel="noreferrer">
              <IonIcon slot="start" icon={logoGoogle} />
              Add to Google Calendar
            </IonButton>
            <IonButton expand="block" href={webcalUrl}>
              <IonIcon slot="start" icon={calendarOutline} />
              Apple Calendar, Outlook, or other
            </IonButton>
            <IonButton expand="block" fill="outline" onClick={copy}>
              <IonIcon slot="start" icon={copyOutline} />
              {copied ? 'Link copied' : 'Copy link'}
            </IonButton>
            <IonText color="medium">
              <p>
                This link is private to you — anyone who has it can see the titles and dates of what you've starred, so don't
                share it.
              </p>
            </IonText>
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
