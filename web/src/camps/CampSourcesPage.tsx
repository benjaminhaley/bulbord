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
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { addOutline, closeOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { createCampSource, fetchCampSources, type CampSource } from './api'

// Admin-only (see App.tsx's AdminRoute) — same treatment as
// events/SourcesPage.tsx's AddSourceForm (feedback #102 follow-up, "be sure
// the camps page gets the same treatment, particularly sources should be
// moved"): moved off the member-facing Camps toolbar into Developer Tools.
// No Type field — every real camp source has been "provider_website" in
// practice (see CLAUDE.md's Camps section), so the server hardcodes it.
function AddSourceForm({ onCreated, onCancel }: { onCreated: (source: CampSource) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim() && url.trim()

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createCampSource({ name: name.trim(), url: url.trim(), notes: notes.trim() })
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
      <IonItem lines="none">
        <IonInput label="URL" labelPlacement="stacked" value={url} onIonInput={(e) => setUrl(e.detail.value ?? '')} />
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

export function CampSourcesPage() {
  const [sources, setSources] = useState<CampSource[] | null>(null)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    fetchCampSources()
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
            what makes a camp appropriate to add. */}
        <p className="ion-padding-horizontal ion-padding-top" style={{ color: 'var(--ion-color-medium)' }}>
          Camps for when school is closed. The ideal camp is close to the school, covers most of a workday, and is
          well attended by people at Nettelhorst.
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
              <IonItem key={source.id} routerLink={`/camp-sources/${source.id}`}>
                <IonLabel>
                  <h2>{source.name}</h2>
                  <IonNote>{source.url}</IonNote>
                </IonLabel>
                <IonNote slot="end">{source.camp_count}</IonNote>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
