import {
  IonAccordion,
  IonAccordionGroup,
  IonActionSheet,
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
import {
  addOutline,
  closeOutline,
  ellipsisVerticalOutline,
  imageOutline,
} from 'ionicons/icons'
import { type ReactNode, useEffect, useState } from 'react'

import { InstitutionBanner } from '../app/InstitutionBanner'
import { useAuth } from '../auth/AuthContext'
import { API_URL } from '../config'
import { formatDate } from '../format'
import { ImageLightbox } from '../uploads/ImageLightbox'
import type { UploadedImage } from '../uploads/api'
import {
  backlogFeedback,
  completeFeedback,
  createFeedback,
  deleteFeedback,
  fetchFeedback,
  startProgressFeedback,
  stopProgressFeedback,
  unbacklogFeedback,
  updateFeedback,
  type FeedbackItem,
} from './api'
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
      {/* Explicit color, not Ionic's default muted <p>-in-IonLabel styling
          (style audit, feedback #70, finding 07) — this is the post's own
          content, not metadata about it, unlike a list row's date/location
          (which stays muted deliberately, see finding 05) or this item's
          own #number/author/date line just below. */}
      {item.description && <p style={{ color: 'var(--ion-text-color)' }}>{item.description}</p>}
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
  onDeleted,
  onImageClick,
}: {
  item: FeedbackItem
  isAdmin: boolean
  onCompleted: (item: FeedbackItem) => void
  onUpdated: (item: FeedbackItem) => void
  onDeleted: (id: string) => void
  onImageClick: (url: string) => void
}) {
  const [markingDone, setMarkingDone] = useState(false)
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  async function confirmDone(note: string) {
    const updated = await completeFeedback(item.id, note)
    onCompleted(updated)
    setMarkingDone(false)
  }

  async function toggleBacklog() {
    onUpdated(item.backlogged_at ? await unbacklogFeedback(item.id) : await backlogFeedback(item.id))
  }

  async function toggleInProgress() {
    onUpdated(item.in_progress_at ? await stopProgressFeedback(item.id) : await startProgressFeedback(item.id))
  }

  async function remove() {
    if (!window.confirm('Delete this feedback post?')) return
    await deleteFeedback(item.id)
    onDeleted(item.id)
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
        onImageClick={onImageClick}
      />
    )
  }

  const canModerate = isAdmin && !item.completed_at
  const showMenu = item.can_edit || canModerate
  type MenuButton = { text: string; role?: 'destructive' | 'cancel'; handler?: () => void }
  const menuButtons: MenuButton[] = (
    [
      item.can_edit && { text: 'Edit', handler: () => setEditing(true) },
      canModerate && { text: 'Mark done', handler: () => setMarkingDone(true) },
      canModerate && { text: item.in_progress_at ? 'Restore to open' : 'Move to in progress', handler: toggleInProgress },
      canModerate && { text: item.backlogged_at ? 'Restore to open' : 'Move to backlog', handler: toggleBacklog },
      item.can_edit && { text: 'Delete', role: 'destructive' as const, handler: remove },
      { text: 'Cancel', role: 'cancel' as const },
    ] as (MenuButton | false)[]
  ).filter((b): b is MenuButton => b !== false)

  return (
    <>
      <IonItem lines={markingDone ? 'none' : 'full'}>
        <FeedbackItemBody
          item={item}
          extra={item.completion_note && <p>{item.completion_note}</p>}
          onImageClick={onImageClick}
        />
        {showMenu && !markingDone && (
          <IonButton slot="end" fill="clear" onClick={() => setMenuOpen(true)} aria-label="Actions">
            <IonIcon slot="icon-only" icon={ellipsisVerticalOutline} />
          </IonButton>
        )}
      </IonItem>
      {markingDone && <MarkDoneForm onConfirm={confirmDone} onCancel={() => setMarkingDone(false)} />}
      <IonActionSheet isOpen={menuOpen} onDidDismiss={() => setMenuOpen(false)} buttons={menuButtons} />
    </>
  )
}

function FeedbackAccordionSection({
  value,
  label,
  items,
  isAdmin,
  onCompleted,
  onUpdated,
  onDeleted,
  onImageClick,
}: {
  value: string
  label: string
  items: FeedbackItem[]
  isAdmin: boolean
  onCompleted: (item: FeedbackItem) => void
  onUpdated: (item: FeedbackItem) => void
  onDeleted: (id: string) => void
  onImageClick: (url: string) => void
}) {
  if (items.length === 0) return null

  return (
    <IonAccordionGroup>
      <IonAccordion value={value}>
        <IonItem slot="header">
          <IonLabel>
            {label} ({items.length})
          </IonLabel>
        </IonItem>
        <IonList slot="content">
          {items.map((item) => (
            <FeedbackListItem
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              onCompleted={onCompleted}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
              onImageClick={onImageClick}
            />
          ))}
        </IonList>
      </IonAccordion>
    </IonAccordionGroup>
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

  const openItems =
    items?.filter((item) => !item.completed_at && !item.backlogged_at && !item.in_progress_at) ?? []
  const inProgressItems = items?.filter((item) => item.in_progress_at && !item.completed_at) ?? []
  const backlogItems = items?.filter((item) => item.backlogged_at && !item.completed_at) ?? []
  const closedItems = items?.filter((item) => item.completed_at) ?? []

  function handleUpdated(updated: FeedbackItem) {
    setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)) ?? null)
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev?.filter((i) => i.id !== id) ?? null)
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
            onImageClick={(url) => setLightboxSrc(`${API_URL}${url}`)}
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
                  onDeleted={handleDeleted}
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

            <FeedbackAccordionSection
              value="in-progress"
              label="In Progress"
              items={inProgressItems}
              isAdmin={isAdmin}
              onCompleted={handleUpdated}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              onImageClick={(url) => setLightboxSrc(`${API_URL}${url}`)}
            />

            <FeedbackAccordionSection
              value="backlog"
              label="Backlog"
              items={backlogItems}
              isAdmin={isAdmin}
              onCompleted={handleUpdated}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              onImageClick={(url) => setLightboxSrc(`${API_URL}${url}`)}
            />

            <FeedbackAccordionSection
              value="closed"
              label="Closed"
              items={closedItems}
              isAdmin={isAdmin}
              onCompleted={handleUpdated}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              onImageClick={(url) => setLightboxSrc(`${API_URL}${url}`)}
            />
          </>
        )}
      </IonContent>
      <ImageLightbox src={lightboxSrc} onDismiss={() => setLightboxSrc(null)} />
    </IonPage>
  )
}
