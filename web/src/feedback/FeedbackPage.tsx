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
import { addOutline, checkmarkOutline, closeOutline, createOutline, imageOutline } from 'ionicons/icons'
import { type ReactNode, useEffect, useState } from 'react'

import { InstitutionBanner } from '../app/InstitutionBanner'
import { useAuth } from '../auth/AuthContext'
import { API_URL } from '../config'
import { formatDate } from '../format'
import { ImageLightbox } from '../uploads/ImageLightbox'
import type { UploadedImage } from '../uploads/api'
import { completeFeedback, createFeedback, fetchFeedback, updateFeedback, type FeedbackItem } from './api'
import { useMultiImageUpload } from './useMultiImageUpload'

function FeedbackImages({ images, onImageClick }: { images: UploadedImage[]; onImageClick: (url: string) => void }) {
  if (images.length === 0) return null

  if (images.length === 1) {
    const [image] = images
    return (
      <img
        src={`${API_URL}${image.thumbnail_url}`}
        alt=""
        onClick={() => onImageClick(image.image_url)}
        style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 8, margin: '8px 0', cursor: 'pointer' }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0' }}>
      {images.map((image, index) => (
        <img
          key={`${image.thumbnail_url}-${index}`}
          src={`${API_URL}${image.thumbnail_url}`}
          alt=""
          onClick={() => onImageClick(image.image_url)}
          style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
        />
      ))}
    </div>
  )
}

function PhotoPicker({
  images,
  uploading,
  fileInputRef,
  onFiles,
  onRemove,
}: {
  images: UploadedImage[]
  uploading: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFiles: (files: FileList) => void
  onRemove: (index: number) => void
}) {
  return (
    <>
      <IonItem lines="none">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <IonButton fill="clear" onClick={() => fileInputRef.current?.click()}>
          <IonIcon slot="icon-only" icon={imageOutline} />
        </IonButton>
        {uploading && <IonSpinner name="dots" />}
      </IonItem>
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 8px' }}>
          {images.map((image, index) => (
            <div key={`${image.thumbnail_url}-${index}`} style={{ position: 'relative' }}>
              <img
                src={`${API_URL}${image.thumbnail_url}`}
                alt=""
                style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }}
              />
              <IonButton
                fill="clear"
                size="small"
                style={{ position: 'absolute', top: -14, right: -14, '--padding-start': '4px', '--padding-end': '4px' }}
                onClick={() => onRemove(index)}
              >
                <IonIcon slot="icon-only" icon={closeOutline} />
              </IonButton>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function makePasteHandler(onFiles: (files: File[]) => void) {
  return function handlePaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (files.length === 0) return
    e.preventDefault()
    onFiles(files)
  }
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
      <FeedbackImages images={item.images} onImageClick={onImageClick} />
      {item.description && <p>{item.description}</p>}
      {extra}
      <IonNote>
        #{item.number} · {item.author_name ? `${item.author_name} · ` : ''}
        {formatDate(item.created_at)}
      </IonNote>
    </IonLabel>
  )
}

// Shared by the "new post" and "edit post" flows — they differ only in
// starting values, button copy, and what happens on submit.
function FeedbackForm({
  initialTitle = '',
  initialDescription = '',
  initialImages = [],
  descriptionPlaceholder,
  submitLabel,
  errorMessage,
  onSubmit,
  onCancel,
}: {
  initialTitle?: string
  initialDescription?: string
  initialImages?: UploadedImage[]
  descriptionPlaceholder?: string
  submitLabel: string
  errorMessage: string
  onSubmit: (title: string, description: string, images: UploadedImage[]) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { images, fileInputRef, uploading, attachFiles, removeAt } = useMultiImageUpload(initialImages)
  const handlePaste = makePasteHandler((files) => void attachFiles(files))

  async function submit() {
    if (!title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(title.trim(), description.trim(), images)
    } catch {
      setError(errorMessage)
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
          placeholder={descriptionPlaceholder}
          autoGrow
        />
      </IonItem>
      <PhotoPicker
        images={images}
        uploading={uploading}
        fileInputRef={fileInputRef}
        onFiles={(files) => void attachFiles(files)}
        onRemove={removeAt}
      />
      {error && (
        <IonText color="danger">
          <p className="ion-padding-start">{error}</p>
        </IonText>
      )}
      <IonItem lines="none">
        <IonButton fill="outline" disabled={submitting || uploading || !title.trim()} onClick={submit}>
          {submitLabel}
        </IonButton>
        <IonButton fill="clear" color="medium" disabled={submitting} onClick={onCancel}>
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
  onUpdated,
  onImageClick,
}: {
  item: FeedbackItem
  isAdmin: boolean
  onCompleted: (item: FeedbackItem) => void
  onUpdated: (item: FeedbackItem) => void
  onImageClick: (url: string) => void
}) {
  const [markingDone, setMarkingDone] = useState(false)
  const [editing, setEditing] = useState(false)

  async function confirmDone(note: string) {
    const updated = await completeFeedback(item.id, note)
    onCompleted(updated)
    setMarkingDone(false)
  }

  if (editing) {
    return (
      <FeedbackForm
        initialTitle={item.title}
        initialDescription={item.description ?? ''}
        initialImages={item.images}
        submitLabel="Save"
        errorMessage="Could not save changes"
        onSubmit={async (title, description, images) => {
          onUpdated(await updateFeedback(item.id, title, description, images))
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <>
      <IonItem lines={markingDone ? 'none' : 'full'}>
        <FeedbackItemBody
          item={item}
          extra={item.completion_note && <p>{item.completion_note}</p>}
          onImageClick={onImageClick}
        />
        {item.can_edit && !markingDone && (
          <IonButton fill="clear" slot="end" onClick={() => setEditing(true)}>
            <IonIcon slot="icon-only" icon={createOutline} />
          </IonButton>
        )}
        {isAdmin && !item.completed_at && !markingDone && (
          <IonButton fill="clear" slot="end" onClick={() => setMarkingDone(true)}>
            <IonIcon slot="icon-only" icon={checkmarkOutline} />
          </IonButton>
        )}
      </IonItem>
      {markingDone && <MarkDoneForm onConfirm={confirmDone} onCancel={() => setMarkingDone(false)} />}
    </>
  )
}

export function FeedbackPage() {
  const { isAdmin } = useAuth()
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

  function handleUpdated(updated: FeedbackItem) {
    setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)) ?? null)
  }

  return (
    <IonPage>
      <IonHeader>
        <InstitutionBanner />
        <IonToolbar>
          <IonTitle>Feedback</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => setShowForm((v) => !v)}>
              <IonIcon slot="icon-only" icon={showForm ? closeOutline : addOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        {showForm && (
          <FeedbackForm
            descriptionPlaceholder="Paste a screenshot here, or attach one below"
            submitLabel="Post"
            errorMessage="Could not post feedback"
            onSubmit={async (title, description, images) => {
              const created = await createFeedback(title, description, images)
              setItems((prev) => [created, ...(prev ?? [])])
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
                  onCompleted={handleUpdated}
                  onUpdated={handleUpdated}
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
                      <FeedbackListItem
                        key={item.id}
                        item={item}
                        isAdmin={isAdmin}
                        onCompleted={handleUpdated}
                        onUpdated={handleUpdated}
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
