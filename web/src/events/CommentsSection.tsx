import { IonButton, IonIcon, IonSpinner, IonTextarea } from '@ionic/react'
import { trashOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { formatDate } from '../format'
import { Avatar } from '../uploads/Avatar'
import { createEventComment, deleteEventComment, fetchEventComments, updateEventComment, type EventComment } from './api'

function CommentItem({
  comment,
  onUpdated,
  onDeleted,
}: {
  comment: EventComment
  onUpdated: (updated: EventComment) => void
  onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  async function save() {
    const trimmed = body.trim()
    if (!trimmed || trimmed === comment.body) {
      setEditing(false)
      setBody(comment.body)
      return
    }
    setSaving(true)
    try {
      onUpdated(await updateEventComment(comment.event_id, comment.id, trimmed))
      setEditing(false)
    } catch {
      // leave the form open with the user's text so nothing typed is lost
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm('Delete this comment?')) return
    try {
      await deleteEventComment(comment.event_id, comment.id)
      onDeleted(comment.id)
    } catch {
      // no-op; comment stays visible so the user can retry
    }
  }

  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--ion-color-step-100)' }}>
      <Avatar url={comment.author_avatar_url} name={comment.author_name ?? undefined} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0 }}>
          <strong>{comment.author_name ?? 'Member'}</strong>{' '}
          <span style={{ color: 'var(--ion-color-medium)' }}>{formatDate(comment.created_at)}</span>
        </p>
        {editing ? (
          <>
            <IonTextarea value={body} onIonInput={(e) => setBody(e.detail.value ?? '')} autoGrow autofocus />
            <IonButton size="small" fill="outline" disabled={saving || !body.trim()} onClick={save}>
              Save
            </IonButton>
            <IonButton
              size="small"
              fill="clear"
              color="medium"
              disabled={saving}
              onClick={() => {
                setEditing(false)
                setBody(comment.body)
              }}
            >
              Cancel
            </IonButton>
          </>
        ) : (
          <>
            <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{comment.body}</p>
            {(comment.can_edit || comment.can_delete) && (
              <div style={{ display: 'flex', gap: 4 }}>
                {comment.can_edit && (
                  <IonButton size="small" fill="clear" onClick={() => setEditing(true)}>
                    Edit
                  </IonButton>
                )}
                {comment.can_delete && (
                  <IonButton size="small" fill="clear" color="danger" onClick={remove}>
                    <IonIcon slot="icon-only" icon={trashOutline} />
                  </IonButton>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function CommentsSection({ eventId }: { eventId: string }) {
  const [comments, setComments] = useState<EventComment[] | null>(null)
  const [error, setError] = useState(false)
  const [newBody, setNewBody] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    setComments(null)
    setError(false)
    fetchEventComments(eventId)
      .then(setComments)
      .catch(() => setError(true))
  }, [eventId])

  async function post() {
    const trimmed = newBody.trim()
    if (!trimmed) return
    setPosting(true)
    try {
      const created = await createEventComment(eventId, trimmed)
      setComments((prev) => [created, ...(prev ?? [])])
      setNewBody('')
    } catch {
      setError(true)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2>Comments</h2>
      {comments === null && !error && <IonSpinner name="dots" />}
      {error && comments === null && <p>Couldn't load comments</p>}
      {comments !== null && comments.length === 0 && <p style={{ color: 'var(--ion-color-medium)' }}>No comments yet</p>}
      {comments?.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          onUpdated={(updated) => setComments((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? null)}
          onDeleted={(id) => setComments((prev) => prev?.filter((c) => c.id !== id) ?? null)}
        />
      ))}
      <div style={{ marginTop: 12 }}>
        <IonTextarea
          value={newBody}
          onIonInput={(e) => setNewBody(e.detail.value ?? '')}
          placeholder="Add a comment"
          autoGrow
        />
        <IonButton fill="outline" disabled={posting || !newBody.trim()} onClick={post}>
          Post
        </IonButton>
      </div>
    </div>
  )
}
