import { IonButton, IonIcon, IonInput, IonItem, IonLabel, IonList, IonSpinner, IonText, IonTextarea } from '@ionic/react'
import { closeOutline, imageOutline } from 'ionicons/icons'
import { useEffect, useRef, useState } from 'react'

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

// Exported so CommentsSection.tsx's reply composer/editor can reuse the
// exact same attach-photo UI (feedback, 2026-08-17: "image pasting isn't
// working in feedback replies. It should work the same way it would in the
// original post").
export function PhotoPicker({
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
        {/* ionic-exception: Ionic has no file-picker component; a hidden
            native file input triggered by a real button is the standard
            pattern (see the IonButton below). */}
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

// Exported for the same reason as PhotoPicker above.
export function makePasteHandler(onFiles: (files: File[]) => void) {
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
  const titleInputRef = useRef<HTMLIonInputElement>(null)

  // The plain HTML `autofocus` attribute this used to carry doesn't
  // actually move focus here: this form is revealed by clicking a toggle
  // button (FeedbackPage's toolbar "+", or a post's own edit pencil) that
  // stays mounted right next to it, and Chrome's autofocus processing is a
  // no-op whenever *anything* in the document already has focus -- which
  // the still-present toggle button does. Left focus stuck on that button,
  // so pasting an image right after opening the form (without clicking
  // into a field first) silently went nowhere: the paste event never
  // reached this list's onPaste handler at all (feedback #121, reproduced
  // directly -- document.activeElement stayed the toggle ion-button, not
  // the title input). A real, imperative setFocus() call doesn't have that
  // "something else already has focus" escape hatch.
  useEffect(() => {
    // A setFocus() called immediately here (react's effect fires right
    // after commit) resolves its promise but silently focuses nothing --
    // verified directly (the promise resolved, yet document.activeElement
    // never changed). Stencil schedules ion-input's *internal* shadow
    // render (which is what actually creates the real native <input>
    // setFocus() needs to call .focus() on) asynchronously relative to the
    // custom element being inserted, so it isn't necessarily ready the
    // instant this effect runs. A double rAF reliably waits past that.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => titleInputRef.current?.setFocus()))
    return () => cancelAnimationFrame(raf)
  }, [])

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
        <IonInput ref={titleInputRef} value={title} onIonInput={(e) => setTitle(e.detail.value ?? '')} />
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
