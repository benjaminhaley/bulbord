import { IonButton, IonIcon, IonItem, IonSpinner, IonTextarea } from '@ionic/react'
import { addOutline, trashOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { formatDate } from '../format'
import { headingContentGap, sectionDividerStyle } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import {
  createSportsClubComment,
  deleteSportsClubComment,
  fetchSportsClubComments,
  fetchSportsClubSourceNotes,
  updateSportsClubComment,
  type SourceNote,
  type SportsClubComment,
} from './api'

// This listing's own comments and cross-listing notes from other listings
// sharing the same source (mirrors camps' feedback #50 pattern) are
// normalized into one shape and rendered as a single, uniformly-styled
// list, newest first. date_label is null for a comment on the listing
// currently being viewed (redundant) and the sibling listing's own title
// for a comment from elsewhere at the same source — titled, not dated,
// since a sports club's schedule (a date range, "Ongoing", or nothing at
// all) doesn't collapse into one short label the way a camp's date range
// does, so the sibling's name is the more reliably legible distinguisher.
interface DisplayComment {
  id: string
  sports_club_id: string
  body: string
  created_at: string
  author_name: string | null
  author_avatar_url: string | null
  can_edit: boolean
  can_delete: boolean
  date_label: string | null
}

function fromOwnComment(c: SportsClubComment): DisplayComment {
  return { ...c, date_label: null }
}

function fromSourceNote(n: SourceNote): DisplayComment {
  return {
    id: n.id,
    sports_club_id: n.sports_club_id,
    body: n.body,
    created_at: n.created_at,
    author_name: n.author_name,
    author_avatar_url: n.author_avatar_url,
    can_edit: false,
    can_delete: false,
    date_label: n.sports_club_title,
  }
}

function byNewestFirst(a: DisplayComment, b: DisplayComment): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

function CommentItem({
  comment,
  onUpdated,
  onDeleted,
}: {
  comment: DisplayComment
  onUpdated: (updated: DisplayComment) => void
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
      onUpdated(fromOwnComment(await updateSportsClubComment(comment.sports_club_id, comment.id, trimmed)))
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
      await deleteSportsClubComment(comment.sports_club_id, comment.id)
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
          {comment.date_label && (
            <>
              {' · '}
              <Link to={`/sports-clubs/${comment.sports_club_id}`} style={{ color: 'var(--ion-color-medium)' }}>
                {comment.date_label}
              </Link>
            </>
          )}
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

export function CommentsSection({ sportsClubId, source }: { sportsClubId: string; source: { id: string; name: string } | null }) {
  const [comments, setComments] = useState<DisplayComment[] | null>(null)
  const [error, setError] = useState(false)
  const [newBody, setNewBody] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    setComments(null)
    setError(false)
    Promise.all([fetchSportsClubComments(sportsClubId), source ? fetchSportsClubSourceNotes(sportsClubId) : Promise.resolve([])])
      .then(([own, notes]) => {
        setComments([...own.map(fromOwnComment), ...notes.map(fromSourceNote)].sort(byNewestFirst))
      })
      .catch(() => setError(true))
  }, [sportsClubId, source])

  async function post() {
    const trimmed = newBody.trim()
    if (!trimmed) return
    setPosting(true)
    try {
      const created = await createSportsClubComment(sportsClubId, trimmed)
      setComments((prev) => [fromOwnComment(created), ...(prev ?? [])])
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
        <IonItem lines="none" style={{ '--padding-start': '0', '--min-height': '40px' } as React.CSSProperties}>
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
