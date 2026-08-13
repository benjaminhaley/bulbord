import { IonButton, IonIcon, IonItem, IonSpinner, IonTextarea } from '@ionic/react'
import { addOutline, trashOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { formatDate } from '../format'
import { headingContentGap, sectionDividerStyle } from '../theme/layout'
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
      {/* Matches CampDetailPage.tsx's own section dividers (feedback,
          2026-08-05: "separate all these sections a little better... a thin
          horizontal line between them") — margin overridden to 0 on the
          bottom side since this div's own marginTop: 24 above already
          provides the gap before the rule. */}
      <hr style={{ ...sectionDividerStyle, margin: '0 0 24px' }} />
      <h2>Comments</h2>
      {comments === null && !error && <IonSpinner name="dots" />}
      {error && comments === null && <p>Couldn't load comments</p>}
      {comments?.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          onUpdated={(updated) => setComments((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? null)}
          onDeleted={(id) => setComments((prev) => prev?.filter((c) => c.id !== id) ?? null)}
        />
      ))}
      <div style={headingContentGap}>
        {/* An empty list already falls through to this composer as its own
            empty state — a separate "No comments yet" message next to it
            was redundant (feedback, 2026-08-05, ported here from Camps'
            identical fix). IonItem + IonIcon slot="start", not a hand-rolled
            flex row: Ionic's own item layout centers a slotted icon against
            its content correctly by construction, where several rounds of
            hand-tuned flexbox/margin guesses on Camps' identical composer
            did not — see camps/CommentsSection.tsx for the full history.
            The --padding-top/--padding-bottom split below is that same
            empirically-measured value (not a fresh guess), valid here too
            since it's the same font/line-height. */}
        <IonItem lines="none" style={{ '--padding-start': '0', '--min-height': '40px' } as React.CSSProperties}>
          {/* translateY: see camps/CommentsSection.tsx's identical fix — a
              real, measured ~1.5px CSS icon/text misalignment (style audit,
              feedback #70, finding 04), found via ink-centroid analysis of
              a live screenshot, present in this same ported code. */}
          <IonIcon
            icon={addOutline}
            slot="start"
            style={{ color: 'var(--ion-color-medium)', marginInlineEnd: '10px', transform: 'translateY(-1.5px)' }}
          />
          <IonTextarea
            value={newBody}
            onIonInput={(e) => setNewBody(e.detail.value ?? '')}
            placeholder="Add a comment"
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
