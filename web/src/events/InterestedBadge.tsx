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

// Max icons shown before collapsing the rest into a "+N" bubble — keeps the
// stack from growing unboundedly wide on a popular event.
const MAX_STACKED_ICONS = 5

// Attendance-signal social proof (see CLAUDE.md's data classification: names
// and avatars only, never contact/PII). Stops propagation on open so this can
// sit inside an EventsPage row without also triggering the row's own
// routerLink navigation to the event detail page. Closed state keeps the
// "N interested:" label but swaps the name list for a small icon stack
// (feedback #43, refined per follow-up feedback — bare icons with no label
// read as unclear on their own).
export function InterestedBadge({
  eventId,
  count,
  people,
}: {
  eventId: string
  count: number
  people: { name: string; avatar_url: string | null }[]
}) {
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

  const shown = people.slice(0, MAX_STACKED_ICONS)
  const overflow = count - shown.length

  return (
    <>
      <div
        onClick={show}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 4 }}
      >
        <IonNote>{count} interested:</IonNote>
        {shown.map((person, i) => (
          <div key={i} style={{ marginInlineStart: i === 0 ? 0 : -8, border: '2px solid var(--ion-background-color)', borderRadius: '50%' }}>
            <Avatar url={person.avatar_url} name={person.name} size={24} />
          </div>
        ))}
        {overflow > 0 && (
          <IonNote style={{ marginInlineStart: 4 }}>+{overflow}</IonNote>
        )}
      </div>
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
                  <Avatar slot="start" url={user.avatar_url} name={user.name} />
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
