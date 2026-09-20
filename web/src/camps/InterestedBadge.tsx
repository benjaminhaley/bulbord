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

import { useRequireLogin } from '../auth/LoginPrompt'
import { unstyledButtonStyle } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { fetchInterestedCampUsers, type InterestedUser } from './api'

const MAX_STACKED_ICONS = 5

// Attendance-signal social proof, own copy of events/InterestedBadge.tsx (see
// CLAUDE.md's data classification: names and avatars only, never contact/PII).
//
// emphasized (style audit, feedback #70, finding 01/05): the detail page has
// no title for this line to sit "beneath" — its fact lines (date, address,
// description) are all normal weight, so a muted interested-count read as an
// unexplained demotion there and is shown at full weight (emphasized=true).
// A list row's title (the camp name) makes every line below it, including
// this one, genuinely supporting detail — muted stays the right call there,
// so it's the default.
export function InterestedBadge({
  campId,
  count,
  people,
  emphasized = false,
}: {
  campId: string
  count: number
  people: { name: string; avatar_url: string | null }[]
  emphasized?: boolean
}) {
  const requireLogin = useRequireLogin()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<InterestedUser[] | null>(null)

  function show(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    // The count is public; who's behind it is not (feedback #175).
    if (!requireLogin('Sign in to see who’s interested')) return
    setOpen(true)
    if (!users) {
      fetchInterestedCampUsers(campId)
        .then(setUsers)
        .catch(() => setUsers([]))
    }
  }

  const shown = people.slice(0, MAX_STACKED_ICONS)
  // An anonymous visitor gets no avatars, so "+N" would just repeat the count.
  const overflow = shown.length > 0 ? count - shown.length : 0

  return (
    <>
      {/* A real IonButton, not a hand-rolled `<div onClick>` (2026-08-22
          audit — see InstitutionBanner.tsx's comment for the fuller story). */}
      <IonButton
        fill="clear"
        onClick={show}
        style={{ ...unstyledButtonStyle, display: 'inline-flex', marginTop: 4 }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <IonNote style={emphasized ? { color: 'var(--ion-text-color)', fontSize: 'var(--type-body-size)' } : undefined}>
            {count} interested{shown.length > 0 ? ':' : ''}
          </IonNote>
          {shown.map((person, i) => (
            <span key={i} style={{ display: 'inline-flex', marginInlineStart: i === 0 ? 0 : -8, border: '2px solid var(--ion-background-color)', borderRadius: '50%' }}>
              <Avatar url={person.avatar_url} name={person.name} size={24} />
            </span>
          ))}
          {overflow > 0 && <IonNote style={{ marginInlineStart: 4 }}>+{overflow}</IonNote>}
        </span>
      </IonButton>
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
