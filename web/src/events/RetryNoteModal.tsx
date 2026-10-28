import { IonButton, IonContent, IonHeader, IonIcon, IonModal, IonSpinner, IonText, IonTextarea, IonTitle, IonToolbar } from '@ionic/react'
import { closeOutline } from 'ionicons/icons'
import { useState } from 'react'

import { retryEventWithNote, type EventRetryOutcome } from './api'

// "Retry with note" on an event's page (feedback #186) — the same small note
// sheet as the Add Event review screen's (AddEventModal.tsx), but the note
// acts on the posted event itself. The outcome is always shown here, whether
// or not anything changed (the same rule as Pipeline Review's Retry).
export function RetryNoteModal({
  eventId,
  isOpen,
  onClose,
  onChanged,
  onSplit,
}: {
  eventId: string
  isOpen: boolean
  onClose: () => void
  onChanged: () => void
  onSplit: () => void
}) {
  const [note, setNote] = useState('')
  const [running, setRunning] = useState(false)
  const [outcome, setOutcome] = useState<EventRetryOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const split = outcome && !outcome.stillRunning && outcome.action === 'split' && outcome.handled

  async function retry() {
    setRunning(true)
    setOutcome(null)
    setError(null)
    try {
      const result = await retryEventWithNote(eventId, note.trim())
      setOutcome(result)
      if (!result.stillRunning && result.handled && result.action !== 'split') {
        setNote('')
        onChanged()
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setRunning(false)
    }
  }

  // Every way out (X, swipe, "Back to events") ends here.
  function handleDismiss() {
    onClose()
    if (split) onSplit()
    setOutcome(null)
    setError(null)
  }

  return (
    <IonModal isOpen={isOpen} onDidDismiss={handleDismiss}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Retry with note</IonTitle>
          <IonButton slot="end" fill="clear" onClick={onClose} aria-label="Close">
            <IonIcon slot="icon-only" icon={closeOutline} />
          </IonButton>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonText color="medium">
          <p style={{ fontSize: '0.875rem', margin: '0 0 12px' }}>
            Say what to fix and it will look it up and update this event — e.g. "find which movie is showing and use its poster" or "split this into
            one event per date". Changes show up in History.
          </p>
        </IonText>
        <IonTextarea
          value={note}
          onIonInput={(e) => setNote(e.detail.value ?? '')}
          autoGrow
          autofocus
          disabled={running || !!split}
          placeholder="Note"
          style={{ border: '1px solid var(--ion-color-step-200, #ccc)', borderRadius: 10, padding: '8px 10px' }}
        />
        {split ? (
          <IonButton expand="block" style={{ marginTop: 16 }} onClick={onClose}>
            Back to events
          </IonButton>
        ) : (
          <IonButton expand="block" style={{ marginTop: 16 }} disabled={running || !note.trim()} onClick={() => void retry()}>
            {running ? <IonSpinner name="dots" /> : 'Retry'}
          </IonButton>
        )}
        {running && (
          <IonText color="medium">
            <p style={{ fontSize: '0.8125rem', marginTop: 12 }}>Researching your note. This can take a minute or two.</p>
          </IonText>
        )}
        {!running && outcome && (
          <IonText color="medium">
            <p style={{ fontSize: '0.8125rem', marginTop: 12 }}>
              {outcome.stillRunning
                ? "Still working on this — you'll get a notification with the result."
                : outcome.handled
                  ? `Done: ${outcome.message}`
                  : `Couldn't do what the note asked: ${outcome.message}`}
            </p>
          </IonText>
        )}
        {!running && error && (
          <IonText color="danger">
            <p style={{ fontSize: '0.8125rem', marginTop: 12 }}>{error}</p>
          </IonText>
        )}
      </IonContent>
    </IonModal>
  )
}
