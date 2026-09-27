import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCheckbox,
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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { createOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { formatDate } from '../format'
import { fetchEventSource, recheckEventSource, updateEventSource, type EventSourceDetail, type EventSourceRecheckResult } from './api'
import { EVENT_SOURCE_TYPE_OPTIONS } from './sourceTypes'

// Feedback #41's last remaining piece ("manage sources... from admin" —
// re-running ingestion and its persisted report already existed): rename,
// fix a stale URL, correct notes, or pause/resume a source without the
// destructive step of deleting it. Same admin-only posture and field set
// as SourcesPage.tsx's AddSourceForm, just pre-filled and PATCHing instead
// of POSTing.
function EditSourceForm({
  source,
  onSaved,
  onCancel,
}: {
  source: EventSourceDetail
  onSaved: (patch: { name: string; url: string; type: string; notes: string | null; render_js: boolean }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(source.name)
  const [url, setUrl] = useState(source.url)
  const [type, setType] = useState(source.type)
  const [notes, setNotes] = useState(source.notes ?? '')
  const [renderJs, setRenderJs] = useState(source.render_js)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim() && url.trim() && type

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const trimmedNotes = notes.trim() || null
      await updateEventSource(source.id, { name: name.trim(), url: url.trim(), type, notes: trimmedNotes, render_js: renderJs })
      onSaved({ name: name.trim(), url: url.trim(), type, notes: trimmedNotes, render_js: renderJs })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <IonList inset>
      <IonItem>
        <IonInput label="Name" labelPlacement="stacked" value={name} onIonInput={(e) => setName(e.detail.value ?? '')} />
      </IonItem>
      <IonItem>
        <IonInput label="URL" labelPlacement="stacked" value={url} onIonInput={(e) => setUrl(e.detail.value ?? '')} />
      </IonItem>
      <IonItem>
        <IonSelect label="Type" labelPlacement="stacked" interface="action-sheet" value={type} onIonChange={(e) => setType(e.detail.value)}>
          {EVENT_SOURCE_TYPE_OPTIONS.map((option) => (
            <IonSelectOption key={option.value} value={option.value}>
              {option.label}
            </IonSelectOption>
          ))}
        </IonSelect>
      </IonItem>
      <IonItem>
        <IonCheckbox checked={renderJs} onIonChange={(e) => setRenderJs(e.detail.checked)} labelPlacement="end" justify="start">
          <span className="ion-text-wrap">Always load with a browser (for pages that build their events with JavaScript)</span>
        </IonCheckbox>
      </IonItem>
      <IonItem lines="none">
        <IonTextarea label="Notes" labelPlacement="stacked" placeholder="Optional" value={notes} onIonInput={(e) => setNotes(e.detail.value ?? '')} />
      </IonItem>
      {error && (
        <IonText color="danger">
          <p className="ion-padding-horizontal">{error}</p>
        </IonText>
      )}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px' }}>
        <IonButton fill="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </IonButton>
        <IonButton disabled={!canSubmit || submitting} onClick={submit}>
          {submitting ? <IonSpinner name="dots" /> : 'Save'}
        </IonButton>
      </div>
    </IonList>
  )
}

function SourceEventList({
  title,
  empty,
  events,
  marginBottom,
}: {
  title: string
  empty: string
  events: EventSourceDetail['events']
  marginBottom?: number
}) {
  return (
    <IonList inset style={marginBottom ? { marginBottom } : undefined}>
      <IonListHeader>
        <IonLabel>
          {title} ({events.length})
        </IonLabel>
      </IonListHeader>
      {events.length === 0 && (
        <IonItem lines="none">
          <IonLabel color="medium">{empty}</IonLabel>
        </IonItem>
      )}
      {events.map((event) => (
        <IonItem key={event.id} routerLink={`/events/${event.id}`}>
          <IonLabel>
            <h2>{event.title}</h2>
            <IonNote>{formatDate(event.start_date)}</IonNote>
          </IonLabel>
          {event.status !== 'approved' && <IonBadge color="medium">{event.status}</IonBadge>}
        </IonItem>
      ))}
    </IonList>
  )
}

function describeRecheck(result: EventSourceRecheckResult): string {
  if (result.error) return `Recheck failed: ${result.error}`
  if (result.unreadable) return "Couldn't read the source page — it may be down or blocking us."
  if (result.unchanged) return 'Page unchanged since the last check — nothing new to add.'
  const parts = [`${result.added} new event${result.added === 1 ? '' : 's'} added`]
  if (result.held_back > 0) parts.push(`${result.held_back} held back for fixes`)
  // `rejected` already includes duplicates (ingest saves each one as a
  // rejected candidate), so `skipped` isn't listed separately.
  if (result.rejected > 0) parts.push(`${result.rejected} rejected (duplicates or not relevant)`)
  return `${parts.join(', ')}.`
}

export function SourceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [source, setSource] = useState<EventSourceDetail | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [rechecking, setRechecking] = useState(false)
  const [recheckMessage, setRecheckMessage] = useState<string | null>(null)
  const [recheckReviewPath, setRecheckReviewPath] = useState<string | null>(null)

  useEffect(() => {
    setSource(null)
    setError(false)
    fetchEventSource(id)
      .then(setSource)
      .catch(() => setError(true))
  }, [id])

  // Kept on screen (not a toast) since a recheck takes a while and the
  // answer — especially "unchanged" or an error — is what you came for.
  async function recheck() {
    if (!source) return
    setRechecking(true)
    setRecheckMessage(null)
    setRecheckReviewPath(null)
    try {
      const result = await recheckEventSource(source.id)
      setRecheckMessage(describeRecheck(result))
      if (result.added + result.rejected > 0) setRecheckReviewPath(result.review_path)
      setSource(await fetchEventSource(source.id))
    } catch (err) {
      setRecheckMessage(err instanceof Error ? err.message : 'Could not recheck this source')
    } finally {
      setRechecking(false)
    }
  }

  async function toggleActive() {
    if (!source) return
    setTogglingActive(true)
    try {
      const nextActive = !source.is_active
      await updateEventSource(source.id, { is_active: nextActive })
      setSource((prev) => (prev ? { ...prev, is_active: nextActive } : prev))
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not update this source')
    } finally {
      setTogglingActive(false)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/event-sources" />
          </IonButtons>
          <IonTitle>{source?.name ?? 'Source'}</IonTitle>
          {source && !editing && (
            <IonButtons slot="end">
              <IonButton onClick={() => setEditing(true)} aria-label="Edit source">
                <IonIcon slot="icon-only" icon={createOutline} />
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!source && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this source</p>
          </div>
        )}
        {source && editing && (
          <EditSourceForm
            source={source}
            onSaved={(patch) => {
              setSource((prev) => (prev ? { ...prev, ...patch } : prev))
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        )}
        {source && !editing && (
          <>
            {!source.is_active && <IonBadge color="medium">Inactive — not checked by event sourcing</IonBadge>}
            {source.is_active && source.is_stale && <IonBadge color="warning">Likely stale — no new events found recently</IonBadge>}
            <p>
              {source.last_event_added_at
                ? `Last new event added ${formatDate(source.last_event_added_at)}`
                : 'No events identified yet from this source'}
            </p>
            {source.notes && <p>{source.notes}</p>}
            <p>
              <strong>{source.event_count}</strong> currently shown in the app (approved and upcoming)
            </p>
            <IonButton expand="block" href={source.url} target="_blank" rel="noreferrer">
              Visit source
            </IonButton>
            <IonButton expand="block" fill="outline" disabled={rechecking} onClick={recheck}>
              {rechecking ? 'Rechecking… (up to a minute)' : 'Recheck this source now'}
            </IonButton>
            {recheckMessage && <p style={{ marginTop: 4, marginBottom: 0 }}>{recheckMessage}</p>}
            {/* Everything this recheck produced went through the same 9 checks
                as a weekly run; this opens Pipeline Review filtered to just
                it (the same link the recheck's notification carries). */}
            {recheckReviewPath && (
              <IonButton fill="clear" size="small" routerLink={recheckReviewPath} style={{ marginInline: 0 }}>
                Review this recheck's results
              </IonButton>
            )}
            <IonButton expand="block" fill="outline" color={source.is_active ? 'medium' : 'success'} disabled={togglingActive} onClick={toggleActive}>
              {togglingActive ? <IonSpinner name="dots" /> : source.is_active ? 'Deactivate this source' : 'Activate this source'}
            </IonButton>
            <SourceEventList title="Upcoming events from this source" empty="Nothing upcoming" events={source.events} />
            {/* 72px bottom margin clears the persistent share FAB (index.css's .share-fab). */}
            <SourceEventList title="Past events from this source" empty="No past events" events={source.past_events} marginBottom={72} />
          </>
        )}
      </IonContent>
      <IonToast isOpen={!!toast} message={toast ?? ''} duration={3000} onDidDismiss={() => setToast(null)} />
    </IonPage>
  )
}
