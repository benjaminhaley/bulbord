import {
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

import { AccountButton } from '../auth/AccountButton'
import { useAuth } from '../auth/AuthContext'
import { createFeedback, fetchFeedback, type FeedbackItem } from './api'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function NewFeedbackForm({ onCreated, onCancel }: { onCreated: (item: FeedbackItem) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createFeedback(title.trim(), description.trim())
      onCreated(created)
      setTitle('')
      setDescription('')
    } catch {
      setError('Could not post feedback')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <IonList inset>
      <IonItem>
        <IonLabel position="stacked">Title</IonLabel>
        <IonInput value={title} onIonInput={(e) => setTitle(e.detail.value ?? '')} autofocus />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Description</IonLabel>
        <IonTextarea value={description} onIonInput={(e) => setDescription(e.detail.value ?? '')} autoGrow />
      </IonItem>
      {error && (
        <IonText color="danger">
          <p className="ion-padding-start">{error}</p>
        </IonText>
      )}
      <IonItem lines="none">
        <IonButton fill="outline" disabled={submitting || !title.trim()} onClick={submit}>
          Post
        </IonButton>
        <IonButton fill="clear" color="medium" onClick={onCancel}>
          Cancel
        </IonButton>
      </IonItem>
    </IonList>
  )
}

export function FeedbackPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<FeedbackItem[] | null>(null)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    fetchFeedback()
      .then(setItems)
      .catch(() => setError(true))
  }, [])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Feedback</IonTitle>
          <IonButtons slot="end">
            {user && (
              <IonButton onClick={() => setShowForm((v) => !v)}>
                <IonIcon slot="icon-only" icon={showForm ? closeOutline : addOutline} />
              </IonButton>
            )}
            <AccountButton />
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        {showForm && (
          <NewFeedbackForm
            onCreated={(item) => {
              setItems((prev) => [item, ...(prev ?? [])])
              setShowForm(false)
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {items === null && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Coming soon</p>
          </div>
        )}
        {items !== null && items.length === 0 && !showForm && (
          <div className="coming-soon">
            <p>No feedback yet</p>
          </div>
        )}
        {items !== null && items.length > 0 && (
          <IonList>
            {items.map((item) => (
              <IonItem key={item.id} lines="full">
                <IonLabel className="ion-text-wrap">
                  <h2>{item.title}</h2>
                  {item.description && <p>{item.description}</p>}
                  <IonNote>{formatDate(item.created_at)}</IonNote>
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
