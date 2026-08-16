import { IonButton, IonIcon, IonInput, IonItem, IonLabel, IonList, IonSpinner, IonText, IonTextarea } from '@ionic/react'
import { closeOutline, imageOutline } from 'ionicons/icons'
import { useState } from 'react'

import { API_URL } from '../config'
import type { UploadedImage } from '../uploads/api'
import { useMultiImageUpload } from './useMultiImageUpload'

// Shared new-post / edit-post form — used by both FeedbackPage.tsx (compose
// and inline list-row edit) and FeedbackDetailPage.tsx (edit from the
// detail page). Extracted to its own module (feedback #98) so the detail
// page doesn't need to duplicate it.
export function FeedbackImages({ images, onImageClick }: { images: UploadedImage[]; onImageClick: (url: string) => void }) {
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
  onImageClick,
}: {
  images: UploadedImage[]
  uploading: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFiles: (files: FileList) => void
  onRemove: (index: number) => void
  onImageClick: (url: string) => void
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
                onClick={() => onImageClick(image.image_url)}
                style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
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

// Shared by the "new post" and "edit post" flows — they differ only in
// starting values, button copy, and what happens on submit.
export function FeedbackForm({
  initialTitle = '',
  initialDescription = '',
  initialImages = [],
  descriptionPlaceholder,
  submitLabel,
  errorMessage,
  onSubmit,
  onCancel,
  onImageClick,
}: {
  initialTitle?: string
  initialDescription?: string
  initialImages?: UploadedImage[]
  descriptionPlaceholder?: string
  submitLabel: string
  errorMessage: string
  onSubmit: (title: string, description: string, images: UploadedImage[]) => Promise<void>
  onCancel: () => void
  onImageClick: (url: string) => void
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
        onImageClick={onImageClick}
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
