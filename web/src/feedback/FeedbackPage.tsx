import {
  IonAccordion,
  IonAccordionGroup,
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
import { addOutline, checkmarkOutline, closeOutline } from 'ionicons/icons'
import { type ReactNode, useEffect, useState } from 'react'

import { AccountButton } from '../auth/AccountButton'
import { useAuth } from '../auth/AuthContext'
import { completeFeedback, createFeedback, fetchFeedback, type FeedbackItem } from './api'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function FeedbackItemBody({ item, extra }: { item: FeedbackItem; extra?: ReactNode }) {
  return (
    <IonLabel className="ion-text-wrap">
      <h2>{item.title}</h2>
      {item.description && <p>{item.description}</p>}
      {extra}
      <IonNote>
        {item.author_name ? `${item.author_name} · ` : ''}
        {formatDate(item.created_at)}
      </IonNote>
    </IonLabel>
  )
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

function MarkDoneForm({ onConfirm, onCancel }: { onConfirm: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('')

  return (
    <IonItem lines="none">
      <IonLabel className="ion-text-wrap">
        <IonTextarea
          placeholder="Optional note"
          value={note}
          onIonInput={(e) => setNote(e.detail.value ?? '')}
          autoGrow
          autofocus
        />
        <IonButton fill="outline" size="small" onClick={() => onConfirm(note.trim())}>
          Mark done
        </IonButton>
        <IonButton fill="clear" color="medium" size="small" onClick={onCancel}>
          Cancel
        </IonButton>
      </IonLabel>
    </IonItem>
  )
}

function FeedbackListItem({
  item,
  isAdmin,
  onCompleted,
}: {
  item: FeedbackItem
  isAdmin: boolean
  onCompleted: (item: FeedbackItem) => void
}) {
  const [markingDone, setMarkingDone] = useState(false)

  async function confirmDone(note: string) {
    const updated = await completeFeedback(item.id, note)
    onCompleted(updated)
    setMarkingDone(false)
  }

  return (
    <>
      <IonItem lines={markingDone ? 'none' : 'full'}>
        <FeedbackItemBody item={item} />
        {isAdmin && !markingDone && (
          <IonButton fill="clear" slot="end" onClick={() => setMarkingDone(true)}>
            <IonIcon slot="icon-only" icon={checkmarkOutline} />
          </IonButton>
        )}
      </IonItem>
      {markingDone && <MarkDoneForm onConfirm={confirmDone} onCancel={() => setMarkingDone(false)} />}
    </>
  )
}

function ClosedFeedbackItem({ item }: { item: FeedbackItem }) {
  return (
    <IonItem lines="full">
      <FeedbackItemBody item={item} extra={item.completion_note && <p>{item.completion_note}</p>} />
    </IonItem>
  )
}

export function FeedbackPage() {
  const { user, isAdmin } = useAuth()
  const [items, setItems] = useState<FeedbackItem[] | null>(null)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    fetchFeedback()
      .then(setItems)
      .catch(() => setError(true))
  }, [])

  const openItems = items?.filter((item) => !item.completed_at) ?? []
  const closedItems = items?.filter((item) => item.completed_at) ?? []

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
          <>
            <IonList>
              {openItems.map((item) => (
                <FeedbackListItem
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  onCompleted={(updated) =>
                    setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)) ?? null)
                  }
                />
              ))}
              {openItems.length === 0 && (
                <IonItem lines="full">
                  <IonLabel className="ion-text-wrap">
                    <p>No open feedback</p>
                  </IonLabel>
                </IonItem>
              )}
            </IonList>

            {closedItems.length > 0 && (
              <IonAccordionGroup>
                <IonAccordion value="closed">
                  <IonItem slot="header">
                    <IonLabel>Closed ({closedItems.length})</IonLabel>
                  </IonItem>
                  <IonList slot="content">
                    {closedItems.map((item) => (
                      <ClosedFeedbackItem key={item.id} item={item} />
                    ))}
                  </IonList>
                </IonAccordion>
              </IonAccordionGroup>
            )}
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
