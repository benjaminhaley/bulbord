import { IonButton, IonIcon, IonItem, IonSpinner, IonTextarea } from '@ionic/react'
import { addOutline, trashOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { formatDate } from '../format'
import { headingContentGap, sectionDividerStyle } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import {
  createFeedbackComment,
  deleteFeedbackComment,
  fetchFeedbackComments,
  updateFeedbackComment,
  type FeedbackComment,
} from './api'

// Mirrors events/CommentsSection.tsx exactly (see that file for the history
// behind the icon/text alignment fix and the empty-state posture below) —
// feedback #98 is the reply thread this codebase's Feedback tab never had,
// replacing the old admin-only completionNote field: any member can reply,
// and the post's own author gets an in-app notification (see
// feedback/notifications.ts / InstitutionBanner.tsx's badge).
function CommentItem({
  comment,
  onUpdated,
  onDeleted,
}: {
  comment: FeedbackComment
  onUpdated: (updated: FeedbackComment) => void
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
      onUpdated(await updateFeedbackComment(comment.feedback_id, comment.id, trimmed))
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
      await deleteFeedbackComment(comment.feedback_id, comment.id)
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

export function CommentsSection({ feedbackId }: { feedbackId: string }) {
  const [comments, setComments] = useState<FeedbackComment[] | null>(null)
  const [error, setError] = useState(false)
  const [newBody, setNewBody] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    setComments(null)
    setError(false)
    fetchFeedbackComments(feedbackId)
      .then(setComments)
      .catch(() => setError(true))
  }, [feedbackId])

  async function post() {
    const trimmed = newBody.trim()
    if (!trimmed) return
    setPosting(true)
    try {
      const created = await createFeedbackComment(feedbackId, trimmed)
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
      <hr style={{ ...sectionDividerStyle, margin: '0 0 24px' }} />
      <h2>Replies</h2>
      {comments === null && !error && <IonSpinner name="dots" />}
      {error && comments === null && <p>Couldn't load replies</p>}
      {comments?.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          onUpdated={(updated) => setComments((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? null)}
          onDeleted={(id) => setComments((prev) => prev?.filter((c) => c.id !== id) ?? null)}
        />
      ))}
      <div style={headingContentGap}>
        <IonItem lines="none" style={{ '--padding-start': '0', '--min-height': '40px' } as React.CSSProperties}>
          <IonIcon
            icon={addOutline}
            slot="start"
            style={{ color: 'var(--ion-color-medium)', marginInlineEnd: '10px', transform: 'translateY(-1.5px)' }}
          />
          <IonTextarea
            value={newBody}
            onIonInput={(e) => setNewBody(e.detail.value ?? '')}
            placeholder="Add a reply"
            autoGrow
            style={{ '--padding-top': '16px', '--padding-bottom': '0px' } as React.CSSProperties}
          />
        </IonItem>
        {newBody.trim() && (
          <IonButton fill="outline" disabled={posting} onClick={post}>
            Post
          </IonButton>
        )}
      </div>
    </div>
  )
}
