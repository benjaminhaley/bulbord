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
import { addOutline, checkmarkOutline, closeOutline, imageOutline } from 'ionicons/icons'
import { type ReactNode, useRef, useEffect, useState } from 'react'

import { AccountButton } from '../auth/AccountButton'
import { useAuth } from '../auth/AuthContext'
import { API_URL } from '../config'
import { ImageLightbox } from '../uploads/ImageLightbox'
import { uploadImage, type UploadedImage } from '../uploads/api'
import { completeFeedback, createFeedback, fetchFeedback, type FeedbackItem } from './api'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function FeedbackItemBody({
  item,
  extra,
  onImageClick,
}: {
  item: FeedbackItem
  extra?: ReactNode
  onImageClick: (url: string) => void
}) {
  return (
    <IonLabel className="ion-text-wrap">
      <h2>{item.title}</h2>
      {item.description && <p>{item.description}</p>}
      {item.thumbnail_url && item.image_url && (
        <img
          src={`${API_URL}${item.thumbnail_url}`}
          alt=""
          onClick={() => onImageClick(item.image_url!)}
          style={{ maxWidth: 120, maxHeight: 120, borderRadius: 8, marginTop: 4, cursor: 'pointer' }}
        />
      )}
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
  const [image, setImage] = useState<UploadedImage | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function attachImage(file: File) {
    setUploading(true)
    setError(null)
    try {
      setImage(await uploadImage(file))
    } catch {
      setError('Could not upload image')
    } finally {
      setUploading(false)
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (!file) return
    e.preventDefault()
    void attachImage(file)
  }

  async function submit() {
    if (!title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createFeedback(title.trim(), description.trim(), image ?? undefined)
      onCreated(created)
      setTitle('')
      setDescription('')
      setImage(null)
    } catch {
      setError('Could not post feedback')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <IonList inset onPaste={handlePaste}>
      <IonItem>
        <IonLabel position="stacked">Title</IonLabel>
        <IonInput value={title} onIonInput={(e) => setTitle(e.detail.value ?? '')} autofocus />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Description</IonLabel>
        <IonTextarea
          value={description}
          onIonInput={(e) => setDescription(e.detail.value ?? '')}
          placeholder="Paste a screenshot here, or attach one below"
          autoGrow
        />
      </IonItem>
      <IonItem lines="none">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void attachImage(file)
            e.target.value = ''
          }}
        />
        <IonButton fill="clear" onClick={() => fileInputRef.current?.click()}>
          <IonIcon slot="icon-only" icon={imageOutline} />
        </IonButton>
        {uploading && <IonSpinner name="dots" />}
        {image && (
          <>
            <img
              src={`${API_URL}${image.thumbnail_url}`}
              alt=""
              style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, marginLeft: 8 }}
            />
            <IonButton fill="clear" onClick={() => setImage(null)}>
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </>
        )}
      </IonItem>
      {error && (
        <IonText color="danger">
          <p className="ion-padding-start">{error}</p>
        </IonText>
      )}
      <IonItem lines="none">
        <IonButton fill="outline" disabled={submitting || uploading || !title.trim()} onClick={submit}>
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
  onImageClick,
}: {
  item: FeedbackItem
  isAdmin: boolean
  onCompleted: (item: FeedbackItem) => void
  onImageClick: (url: string) => void
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
        <FeedbackItemBody item={item} onImageClick={onImageClick} />
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

function ClosedFeedbackItem({ item, onImageClick }: { item: FeedbackItem; onImageClick: (url: string) => void }) {
  return (
    <IonItem lines="full">
      <FeedbackItemBody
        item={item}
        extra={item.completion_note && <p>{item.completion_note}</p>}
        onImageClick={onImageClick}
      />
    </IonItem>
  )
}

export function FeedbackPage() {
  const { user, isAdmin } = useAuth()
  const [items, setItems] = useState<FeedbackItem[] | null>(null)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

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
                  onImageClick={(url) => setLightboxSrc(`${API_URL}${url}`)}
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
                      <ClosedFeedbackItem
                        key={item.id}
                        item={item}
                        onImageClick={(url) => setLightboxSrc(`${API_URL}${url}`)}
                      />
                    ))}
                  </IonList>
                </IonAccordion>
              </IonAccordionGroup>
            )}
          </>
        )}
      </IonContent>
      <ImageLightbox src={lightboxSrc} onDismiss={() => setLightboxSrc(null)} />
    </IonPage>
  )
}
