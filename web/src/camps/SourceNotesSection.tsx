import { IonSpinner } from '@ionic/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { formatDate } from '../format'
import { Avatar } from '../uploads/Avatar'
import { fetchCampSourceNotes, type SourceNote } from './api'

// Cross-listing notes (feedback #50): comments left on OTHER camps sharing
// this camp's source, so viewing one YMCA camp surfaces notes people left
// about other YMCA camps too — no events equivalent. Renders nothing (and
// skips the fetch entirely) for a self-submitted camp, which has no source.
export function SourceNotesSection({ campId, source }: { campId: string; source: { id: string; name: string } | null }) {
  const [notes, setNotes] = useState<SourceNote[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!source) return
    setNotes(null)
    setError(false)
    fetchCampSourceNotes(campId)
      .then(setNotes)
      .catch(() => setError(true))
  }, [campId, source])

  if (!source) return null

  return (
    <div style={{ marginTop: 24 }}>
      <h2>Notes from other {source.name} camps</h2>
      {notes === null && !error && <IonSpinner name="dots" />}
      {error && notes === null && <p>Couldn't load notes</p>}
      {notes !== null && notes.length === 0 && (
        <p style={{ color: 'var(--ion-color-medium)' }}>No notes yet from other {source.name} camps</p>
      )}
      {notes?.map((note) => (
        <div key={note.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--ion-color-step-100)' }}>
          <Avatar url={note.author_avatar_url} name={note.author_name ?? undefined} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0 }}>
              <strong>{note.author_name ?? 'Member'}</strong>{' '}
              <span style={{ color: 'var(--ion-color-medium)' }}>{formatDate(note.created_at)}</span>
            </p>
            <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{note.body}</p>
            <Link to={`/camps/${note.camp_id}`} style={{ fontSize: 14 }}>
              on {note.camp_title}
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
