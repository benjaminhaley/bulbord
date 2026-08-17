import {
  IonAccordion,
  IonAccordionGroup,
  IonActionSheet,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  useIonViewWillEnter,
} from '@ionic/react'
import {
  addOutline,
  arrowUndoOutline,
  checkmarkOutline,
  chatbubbleOutline,
  closeOutline,
  createOutline,
  ellipsisVerticalOutline,
  hourglassOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons'
import { type ReactNode, useState } from 'react'
import { useHistory } from 'react-router-dom'

import { InstitutionBanner } from '../app/InstitutionBanner'
import { useAuth } from '../auth/AuthContext'
import { API_URL } from '../config'
import { formatDate } from '../format'
import { ImageLightbox } from '../uploads/ImageLightbox'
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
import { FeedbackForm, FeedbackImages } from './FeedbackForm'

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
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const history = useHistory()

  // One click, no confirmation step (feedback, 2026-08-16: "accidental
  // clicks are unlikely... I should just be able to do it one time").
  async function markDone() {
    onCompleted(await completeFeedback(item.id))
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
  const showMenu = item.can_edit || isAdmin
  type MenuButton = { text: string; icon?: string; role?: 'destructive' | 'cancel'; handler?: () => void }
  const menuButtons: MenuButton[] = (
    [
      item.can_edit && { text: 'Edit', icon: createOutline, handler: () => setEditing(true) },
      canModerate && { text: 'Mark done', icon: checkmarkOutline, handler: markDone },
      canModerate && {
        text: item.in_progress_at ? 'Restore to open' : 'Move to in progress',
        icon: item.in_progress_at ? arrowUndoOutline : hourglassOutline,
        handler: toggleInProgress,
      },
      canModerate && {
        text: item.backlogged_at ? 'Restore to open' : 'Move to backlog',
        icon: item.backlogged_at ? arrowUndoOutline : timeOutline,
        handler: toggleBacklog,
      },
      item.can_edit && { text: 'Delete', icon: trashOutline, role: 'destructive' as const, handler: remove },
      { text: 'Cancel', icon: closeOutline, role: 'cancel' as const },
    ] as (MenuButton | false)[]
  ).filter((b): b is MenuButton => b !== false)

  return (
    <>
      <IonItem lines="none">
        <FeedbackItemBody item={item} onImageClick={onImageClick} />
        {showMenu && (
          <IonButton slot="end" fill="clear" onClick={() => setMenuOpen(true)} aria-label="Actions">
            <IonIcon slot="icon-only" icon={ellipsisVerticalOutline} />
          </IonButton>
        )}
      </IonItem>
      {/* feedback #98: replaces the old admin-only completion note — any
          member can reply on the item's own detail page, and this row is
          the entry point to that thread. */}
      <IonItem button lines="full" detail={false} onClick={() => history.push(`/feedback/${item.id}`)}>
        <IonIcon icon={chatbubbleOutline} slot="start" color="medium" />
        <IonLabel color="medium">
          {item.comment_count > 0 ? `${item.comment_count} ${item.comment_count === 1 ? 'reply' : 'replies'}` : 'Add a reply'}
        </IonLabel>
      </IonItem>
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

  // Ionic keeps this tab's page alive (hidden, not unmounted) once
  // visited — useIonViewWillEnter (not useEffect(fn, [])) so the list
  // refetch (an item's comment_count can change on the detail page pushed
  // on top of this one) fires on every real re-entry, same reasoning as
  // EventsPage's own identical fix. The unseen-reply badge itself is now
  // cleared by dismissing individual notifications (feedback #100), not by
  // opening this tab.
  useIonViewWillEnter(() => {
    fetchFeedback()
      .then(setItems)
      .catch(() => setError(true))
  })

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
