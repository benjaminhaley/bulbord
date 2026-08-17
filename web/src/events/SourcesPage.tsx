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
  IonNote,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { addOutline, closeOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { createEventSource, fetchEventSources, type EventSource } from './api'
import { EVENT_SOURCE_TYPE_OPTIONS } from './sourceTypes'

// Admin-only (see App.tsx's AdminRoute) — sources used to only be added by
// hand-run seed scripts (feedback, 2026-08-17, "consolidate these icons":
// moved off the member-facing Events toolbar into Developer Tools, and kept
// admin-only since a junk source would otherwise silently feed the
// Claude-driven "re-run event sourcing" tool).
function AddSourceForm({ onCreated, onCancel }: { onCreated: (source: EventSource) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState('website')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim() && url.trim() && type

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createEventSource({ name: name.trim(), url: url.trim(), type, notes: notes.trim() })
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this source')
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
          {submitting ? <IonSpinner name="dots" /> : 'Add Source'}
        </IonButton>
      </div>
    </IonList>
  )
}

export function SourcesPage() {
  const [sources, setSources] = useState<EventSource[] | null>(null)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    fetchEventSources()
      .then(setSources)
      .catch(() => setError(true))
  }, [])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/admin/dev-tools" />
          </IonButtons>
          <IonTitle>Sources</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => setShowForm((v) => !v)} aria-label="Add source">
              <IonIcon slot="icon-only" icon={showForm ? closeOutline : addOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        {/* A brief scope guide for whoever (human or AI) is deciding what belongs
            here — feedback #71: the sources list itself doesn't otherwise say
            what makes an event appropriate to add. */}
        <p className="ion-padding-horizontal ion-padding-top" style={{ color: 'var(--ion-color-medium)' }}>
          Events for the Nettelhorst community. The ideal event is close to the school, open to the community, and
          focused on people, not profit — think about what families are talking about when they drop their kids off.
          Those are the events that belong here.
        </p>
        {showForm && (
          <AddSourceForm
            onCreated={(created) => {
              setSources((prev) => [created, ...(prev ?? [])])
              setShowForm(false)
            }}
            onCancel={() => setShowForm(false)}
          />
        )}
        {sources === null && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load sources</p>
          </div>
        )}
        {sources !== null && sources.length > 0 && (
          <IonList>
            {sources.map((source) => (
              <IonItem key={source.id} routerLink={`/event-sources/${source.id}`}>
                <IonLabel>
                  <h2>{source.name}</h2>
                  <IonNote>{source.url}</IonNote>
                </IonLabel>
                <IonNote slot="end">{source.event_count}</IonNote>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
