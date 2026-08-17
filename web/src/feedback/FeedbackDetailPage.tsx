import {
  IonActionSheet,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import {
  arrowUndoOutline,
  checkmarkOutline,
  createOutline,
  ellipsisVerticalOutline,
  hourglassOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { useHistory, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { API_URL } from '../config'
import { formatDate } from '../format'
import { factLineStyle } from '../theme/layout'
import { ImageLightbox } from '../uploads/ImageLightbox'
import {
  backlogFeedback,
  completeFeedback,
  deleteFeedback,
  fetchFeedbackById,
  startProgressFeedback,
  stopProgressFeedback,
  unbacklogFeedback,
  updateFeedback,
  type FeedbackItem,
} from './api'
import { CommentsSection } from './CommentsSection'
import { FeedbackForm } from './FeedbackForm'

// Full-content detail page (feedback #98) — mirrors EventDetailPage.tsx's
// shape: the list row stays a compact-ish summary (see FeedbackPage.tsx's
// FeedbackListItem), and this page is where the whole post plus its reply
// thread live. Edit/delete/mark-done/backlog/in-progress stay reachable
// from the list's own overflow menu too (that UX shipped recently, feedback
// #95 — not being restructured here); this page adds the same actions in
// its own header menu purely so a member who navigated straight into the
// thread isn't forced back out to act on the post.
export function FeedbackDetailPage() {
  const { id } = useParams<{ id: string }>()
  const history = useHistory()
  const { isAdmin } = useAuth()
  const [item, setItem] = useState<FeedbackItem | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  useEffect(() => {
    setItem(null)
    setError(false)
    fetchFeedbackById(id)
      .then(setItem)
      .catch(() => setError(true))
  }, [id])

  async function markDone() {
    if (!item) return
    setItem(await completeFeedback(item.id))
  }

  async function toggleBacklog() {
    if (!item) return
    setItem(item.backlogged_at ? await unbacklogFeedback(item.id) : await backlogFeedback(item.id))
  }

  async function toggleInProgress() {
    if (!item) return
    setItem(item.in_progress_at ? await stopProgressFeedback(item.id) : await startProgressFeedback(item.id))
  }

  async function remove() {
    if (!item || !window.confirm('Delete this feedback post?')) return
    await deleteFeedback(item.id)
    history.push('/feedback')
  }

  const canModerate = isAdmin && !!item && !item.completed_at
  const showMenu = !!item && (item.can_edit || isAdmin)
  type MenuButton = { text: string; icon?: string; role?: 'destructive' | 'cancel'; handler?: () => void }
  const menuButtons: MenuButton[] = item
    ? (
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
          { text: 'Cancel', role: 'cancel' as const },
        ] as (MenuButton | false)[]
      ).filter((b): b is MenuButton => b !== false)
    : []

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/feedback" />
          </IonButtons>
          <IonTitle>{item ? `#${item.number}` : 'Feedback'}</IonTitle>
          {showMenu && !editing && (
            <IonButtons slot="end">
              <IonButton onClick={() => setMenuOpen(true)} aria-label="Actions">
                <IonIcon slot="icon-only" icon={ellipsisVerticalOutline} />
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!item && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this feedback post</p>
          </div>
        )}
        {item && editing && (
          <FeedbackForm
            initialTitle={item.title}
            initialDescription={item.description ?? ''}
            initialImages={item.images}
            submitLabel="Save"
            errorMessage="Could not save changes"
            onSubmit={async (title, description, images) => {
              setItem(await updateFeedback(item.id, title, description, images))
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
            onImageClick={(url) => setLightboxSrc(`${API_URL}${url}`)}
          />
        )}
        {item && !editing && (
          <>
            <h1>{item.title}</h1>
            {item.images.length > 0 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0' }}>
                {item.images.map((image, index) => (
                  <img
                    key={`${image.thumbnail_url}-${index}`}
                    src={`${API_URL}${image.thumbnail_url}`}
                    alt=""
                    onClick={() => setLightboxSrc(`${API_URL}${image.image_url}`)}
                    style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
                  />
                ))}
              </div>
            )}
            {item.description && <p style={factLineStyle}>{item.description}</p>}
            <IonNote>
              #{item.number} · {item.author_name ? `${item.author_name} · ` : ''}
              {formatDate(item.created_at)}
              {item.completed_at ? ' · Completed' : item.backlogged_at ? ' · Backlogged' : item.in_progress_at ? ' · In progress' : ''}
            </IonNote>
            <CommentsSection feedbackId={item.id} onImageClick={(url) => setLightboxSrc(`${API_URL}${url}`)} />
          </>
        )}
      </IonContent>
      <ImageLightbox src={lightboxSrc} onDismiss={() => setLightboxSrc(null)} />
      <IonActionSheet isOpen={menuOpen} onDidDismiss={() => setMenuOpen(false)} buttons={menuButtons} />
    </IonPage>
  )
}
