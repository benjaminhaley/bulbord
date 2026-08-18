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
import { fetchInterestedSportsClubUsers, type InterestedUser } from './api'

const MAX_STACKED_ICONS = 5

// Attendance-signal social proof, own copy of camps/InterestedBadge.tsx (see
// CLAUDE.md's data classification: names and avatars only, never contact/PII).
export function InterestedBadge({
  sportsClubId,
  count,
  people,
  emphasized = false,
}: {
  sportsClubId: string
  count: number
  people: { name: string; avatar_url: string | null }[]
  emphasized?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<InterestedUser[] | null>(null)

  function show(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setOpen(true)
    if (!users) {
      fetchInterestedSportsClubUsers(sportsClubId)
        .then(setUsers)
        .catch(() => setUsers([]))
    }
  }

  const shown = people.slice(0, MAX_STACKED_ICONS)
  const overflow = count - shown.length

  return (
    <>
      <div onClick={show} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 4 }}>
        <IonNote style={emphasized ? { color: 'var(--ion-text-color)', fontSize: 'var(--type-body-size)' } : undefined}>
          {count} interested:
        </IonNote>
        {shown.map((person, i) => (
          <div
            key={i}
            style={{ marginInlineStart: i === 0 ? 0 : -8, border: '2px solid var(--ion-background-color)', borderRadius: '50%' }}
          >
            <Avatar url={person.avatar_url} name={person.name} size={24} />
          </div>
        ))}
        {overflow > 0 && <IonNote style={{ marginInlineStart: 4 }}>+{overflow}</IonNote>}
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
