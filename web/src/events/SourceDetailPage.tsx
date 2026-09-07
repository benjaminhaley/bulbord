import {
  IonBackButton,
  IonBadge,
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
import { fetchEventSource, updateEventSource, type EventSourceDetail } from './api'
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
  onSaved: (patch: { name: string; url: string; type: string; notes: string | null }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(source.name)
  const [url, setUrl] = useState(source.url)
  const [type, setType] = useState(source.type)
  const [notes, setNotes] = useState(source.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim() && url.trim() && type

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const trimmedNotes = notes.trim() || null
      await updateEventSource(source.id, { name: name.trim(), url: url.trim(), type, notes: trimmedNotes })
      onSaved({ name: name.trim(), url: url.trim(), type, notes: trimmedNotes })
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

export function SourceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [source, setSource] = useState<EventSourceDetail | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    setSource(null)
    setError(false)
    fetchEventSource(id)
      .then(setSource)
      .catch(() => setError(true))
  }, [id])

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
            <IonButton expand="block" fill="outline" color={source.is_active ? 'medium' : 'success'} disabled={togglingActive} onClick={toggleActive}>
              {togglingActive ? <IonSpinner name="dots" /> : source.is_active ? 'Deactivate this source' : 'Activate this source'}
            </IonButton>
            <IonList inset>
              <IonListHeader>
                <IonLabel>Upcoming events from this source ({source.events.length})</IonLabel>
              </IonListHeader>
              {source.events.length === 0 && (
                <IonItem lines="none">
                  <IonLabel color="medium">Nothing upcoming</IonLabel>
                </IonItem>
              )}
              {source.events.map((event) => (
                <IonItem key={event.id} routerLink={`/events/${event.id}`}>
                  <IonLabel>
                    <h2>{event.title}</h2>
                    <IonNote>{formatDate(event.start_date)}</IonNote>
                  </IonLabel>
                  {event.status !== 'approved' && <IonBadge color="medium">{event.status}</IonBadge>}
                </IonItem>
              ))}
            </IonList>
          </>
        )}
      </IonContent>
      <IonToast isOpen={!!toast} message={toast ?? ''} duration={3000} onDidDismiss={() => setToast(null)} />
    </IonPage>
  )
}
