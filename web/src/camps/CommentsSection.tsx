import { IonButton, IonIcon, IonItem, IonSpinner, IonTextarea } from '@ionic/react'
import { addOutline, trashOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { formatDate } from '../format'
import { Avatar } from '../uploads/Avatar'
import {
  createCampComment,
  deleteCampComment,
  fetchCampComments,
  fetchCampSourceNotes,
  updateCampComment,
  type CampComment,
  type SourceNote,
} from './api'
import { formatDateRange } from './format'

// This camp's own comments and cross-listing notes from other camps sharing
// the same source (feedback #50) are normalized into one shape and rendered
// as a single, uniformly-styled list — feedback, 2026-08-05: "no longer
// designate whether a comment is from this camp or another date... just
// include all comments... down here... if there is a comment, specify which
// date it came from" (the two used to be visually separate sections with
// different font sizes, which read as "messy and incoherent"). date_label is
// null for a comment on the camp currently being viewed (redundant — the
// whole page is already about that date) and a short date range for a
// comment from a sibling camp at the same source; can_edit/can_delete are
// only ever true for the viewer's own comments on the current camp, never on
// another occurrence's.
interface DisplayComment {
  id: string
  camp_id: string
  body: string
  created_at: string
  author_name: string | null
  author_avatar_url: string | null
  can_edit: boolean
  can_delete: boolean
  date_label: string | null
}

function fromOwnComment(c: CampComment): DisplayComment {
  return { ...c, date_label: null }
}

function fromSourceNote(n: SourceNote): DisplayComment {
  return {
    id: n.id,
    camp_id: n.camp_id,
    body: n.body,
    created_at: n.created_at,
    author_name: n.author_name,
    author_avatar_url: n.author_avatar_url,
    can_edit: false,
    can_delete: false,
    date_label: formatDateRange(n.camp_start_date, n.camp_end_date),
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
      onUpdated(fromOwnComment(await updateCampComment(comment.camp_id, comment.id, trimmed)))
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
      await deleteCampComment(comment.camp_id, comment.id)
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
              <Link to={`/camps/${comment.camp_id}`} style={{ color: 'var(--ion-color-medium)' }}>
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

export function CommentsSection({ campId, source }: { campId: string; source: { id: string; name: string } | null }) {
  const [comments, setComments] = useState<DisplayComment[] | null>(null)
  const [error, setError] = useState(false)
  const [newBody, setNewBody] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    setComments(null)
    setError(false)
    Promise.all([fetchCampComments(campId), source ? fetchCampSourceNotes(campId) : Promise.resolve([])])
      .then(([own, notes]) => {
        setComments([...own.map(fromOwnComment), ...notes.map(fromSourceNote)].sort(byNewestFirst))
      })
      .catch(() => setError(true))
  }, [campId, source])

  async function post() {
    const trimmed = newBody.trim()
    if (!trimmed) return
    setPosting(true)
    try {
      const created = await createCampComment(campId, trimmed)
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
      {/* Matches CampDetailPage.tsx's SECTION_DIVIDER_STYLE (feedback,
          2026-08-05: "separate all these sections a little better... a thin
          horizontal line between them") — duplicated rather than imported,
          since this component owns its own top margin/section boundary and
          a two-line style object isn't worth a cross-file dependency for. */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--ion-color-step-150, #d9d9d9)', margin: '0 0 24px' }} />
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
      <div style={{ marginTop: 12 }}>
        {/* IonItem, not a hand-rolled flex row — its slot="start" icon
            vertically centers against the item's content using Ionic's own
            layout, which a manual flex/margin guess kept failing to match
            (feedback, 2026-08-05, after two attempts: "plus in comments is
            still not centered"). Same pattern already used elsewhere in
            this app (e.g. AccountPage.tsx, DevToolsPage.tsx).
            Still wasn't enough on its own, even after also equalizing
            --padding-top/--padding-bottom (feedback, 2026-08-05, a fourth
            time: "still isn't vertically aligned... I would expect them to
            be vertically centered as in... a horizontal line down the
            middle"). Eyeballing screenshots wasn't precise enough to catch
            a few-pixel offset, so this was finally measured directly:
            cropped a 4x-devicePixelRatio screenshot of just this row and
            computed each glyph's real ink centroid (brightness-weighted
            row average, not a bounding-box trim, which is noisy against
            anti-aliased edges) for the "+" icon and the "Add a comment"
            text separately. Equal padding still left the text sitting
            ~6.5px above the icon's center — the browser's own line-height
            leading isn't symmetric around the glyphs even when the padding
            box is. Fixed by shifting --padding-top/--padding-bottom
            asymmetrically (same 16px total, so the item's own height, and
            therefore the icon's centered position, doesn't move) and
            re-measuring after each attempt until the two centroids landed
            within under 1px of each other — not a guess, an empirically
            converged value for this exact font/line-height. */}
        <IonItem
          lines="none"
          style={{ '--padding-start': '0', '--min-height': '40px' } as React.CSSProperties}
        >
          {/* Ionic's default slot="start" icon spacing (~32px) reads as a
              "strange" gap once the icon is actually vertically aligned
              (feedback, 2026-08-05) — tightened to sit closer to the text. */}
          <IonIcon icon={addOutline} slot="start" style={{ color: 'var(--ion-color-medium)', marginInlineEnd: '10px' }} />
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
