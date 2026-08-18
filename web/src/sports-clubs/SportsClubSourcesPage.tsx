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

import { createSportsClubSource, fetchSportsClubSources, type SportsClubSource } from './api'

// Admin-only (see App.tsx's AdminRoute) — same treatment as
// camps/CampSourcesPage.tsx (feedback #102 precedent, applied here from day
// one rather than migrated later). No Type field — every real sports-club
// source is expected to be "provider_website" in practice, so the server
// hardcodes it.
function AddSourceForm({ onCreated, onCancel }: { onCreated: (source: SportsClubSource) => void; onCancel: () => void }) {
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
      const created = await createSportsClubSource({ name: name.trim(), url: url.trim(), notes: notes.trim() })
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

export function SportsClubSourcesPage() {
  const [sources, setSources] = useState<SportsClubSource[] | null>(null)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    fetchSportsClubSources()
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
        <p className="ion-padding-horizontal ion-padding-top" style={{ color: 'var(--ion-color-medium)' }}>
          Dance classes, sports leagues, and clubs within a few miles of Nettelhorst — the same closeness bar Camps uses.
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
              <IonItem key={source.id} routerLink={`/sports-club-sources/${source.id}`}>
                <IonLabel>
                  <h2>{source.name}</h2>
                  <IonNote>{source.url}</IonNote>
                </IonLabel>
                <IonNote slot="end">{source.sports_club_count}</IonNote>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
