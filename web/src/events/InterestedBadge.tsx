import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { closeOutline } from 'ionicons/icons'
import { useState } from 'react'

import { Avatar } from '../uploads/Avatar'
import { fetchInterestedUsers, type InterestedUser } from './api'

const TEASER_MAX_CHARS = 30

function joinWithAnd(names: string[]): string {
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// Leads with the count (so "1 interested: You" reads as a count followed by
// who, not a sentence with "You" as its subject), then as many actual names
// as fit within the character budget, trailing off with "…" if it doesn't
// all fit — never returns an empty name list since count > 0 here.
export function buildInterestedTeaser(names: string[], totalCount: number, maxChars = TEASER_MAX_CHARS): string {
  for (let shown = names.length; shown >= 1; shown--) {
    const truncated = shown < names.length
    const text = truncated ? `${names.slice(0, shown).join(', ')}…` : joinWithAnd(names.slice(0, shown))
    if (text.length <= maxChars || shown === 1) return `${totalCount} interested: ${text}`
  }
  return `${totalCount} interested`
}

// Attendance-signal social proof (see CLAUDE.md's data classification: names
// and avatars only, never contact/PII). Stops propagation on open so this can
// sit inside an EventsPage row without also triggering the row's own
// routerLink navigation to the event detail page.
export function InterestedBadge({ eventId, count, names }: { eventId: string; count: number; names: string[] }) {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<InterestedUser[] | null>(null)

  function show(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setOpen(true)
    if (!users) {
      fetchInterestedUsers(eventId)
        .then(setUsers)
        .catch(() => setUsers([]))
    }
  }

  return (
    <>
      <IonNote onClick={show} className="interested-badge">
        {buildInterestedTeaser(names, count)}
      </IonNote>
      <IonModal isOpen={open} onDidDismiss={() => setOpen(false)}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Interested</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setOpen(false)}>
                <IonIcon slot="icon-only" icon={closeOutline} />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          {!users && (
            <div className="coming-soon">
              <IonSpinner name="dots" />
            </div>
          )}
          {users && users.length === 0 && (
            <div className="coming-soon">
              <p>No one yet</p>
            </div>
          )}
          {users && users.length > 0 && (
            <IonList>
              {users.map((user) => (
                <IonItem key={user.id}>
                  <Avatar slot="start" url={user.avatar_url} />
                  <IonLabel>{user.name}</IonLabel>
                </IonItem>
              ))}
            </IonList>
          )}
        </IonContent>
      </IonModal>
    </>
  )
}
