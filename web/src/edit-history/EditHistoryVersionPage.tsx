import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonPage, IonSpinner, IonTitle, IonToast, IonToolbar } from '@ionic/react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'

import { factLineStyle, leadingButtonGap } from '../theme/layout'
import { fetchEditHistoryEntry, restoreEditHistoryEntry, type EditHistoryDetail } from './api'

// Feedback #141: "the ability to reload that old version and see the
// fields... the fields that have changed maybe highlighted in red." Renders
// one history entry's `after` snapshot through the *same* Body component
// the live detail page uses (via `renderBody`, a render-prop each entity's
// own thin wrapper page supplies — see events/EventHistoryVersionPage.tsx)
// — not a generic diff table — with `highlightFields` (the snapshot's own
// `changed_fields`, i.e. what this particular edit action actually touched)
// passed straight through to that same Body component's highlight support.
// "Restore" replays the snapshot through the ordinary edit path (a new
// forward entry, never a rewrite of history — see the backend's own
// restore endpoint) and hands the caller back to the live page.
export function EditHistoryVersionPage({
  editId,
  backHref,
  liveHref,
  renderBody,
}: {
  editId: string
  backHref: string
  liveHref: string
  renderBody: (entry: EditHistoryDetail) => ReactNode
}) {
  const history = useHistory()
  const [entry, setEntry] = useState<EditHistoryDetail | null>(null)
  const [error, setError] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoredToast, setRestoredToast] = useState(false)

  useEffect(() => {
    setEntry(null)
    setError(false)
    fetchEditHistoryEntry(editId)
      .then(setEntry)
      .catch(() => setError(true))
  }, [editId])

  async function restore() {
    if (!window.confirm('Restore this version? This becomes the new current version — nothing is deleted from the history.')) return
    setRestoring(true)
    setRestoreError(null)
    try {
      await restoreEditHistoryEntry(editId)
      setRestoredToast(true)
      history.push(liveHref)
    } catch {
      setRestoreError('Could not restore this version')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={backHref} />
          </IonButtons>
          <IonTitle>Past Version</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!entry && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this version</p>
          </div>
        )}
        {entry && (
          <>
            <p style={{ ...factLineStyle, color: 'var(--ion-color-medium)' }}>
              {entry.actor.name} · {new Date(entry.created_at).toLocaleString()}
            </p>
            {renderBody(entry)}
            {restoreError && <p style={{ ...factLineStyle, color: 'var(--ion-color-danger)' }}>{restoreError}</p>}
            <IonButton expand="block" style={leadingButtonGap} disabled={restoring} onClick={restore}>
              {restoring ? <IonSpinner name="dots" /> : 'Restore This Version'}
            </IonButton>
          </>
        )}
      </IonContent>
      <IonToast isOpen={restoredToast} onDidDismiss={() => setRestoredToast(false)} message="Restored" duration={1500} />
    </IonPage>
  )
}
