import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { useEffect, useState } from 'react'

import { formatDate } from '../format'
import { Avatar } from '../uploads/Avatar'
import { fetchAdminUsers, type AdminUser } from './api'

function roleLabel(user: AdminUser): string | null {
  if (user.role === 'staff') return 'Staff'
  if (user.role === 'family') return 'Family'
  if (user.role === 'other') return user.role_other ? `Other: ${user.role_other}` : 'Other'
  return null
}

// First admin view in the app (see CLAUDE.md's Introspectability section) —
// every member, plus the basic invited-by social graph.
export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchAdminUsers()
      .then(setUsers)
      .catch(() => setError(true))
  }, [])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/account" />
          </IonButtons>
          <IonTitle>All Members</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        {users === null && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Could not load members</p>
          </div>
        )}
        {users !== null && (
          <IonList>
            {users.map((user) => (
              <IonItem key={user.id} lines="full">
                <Avatar slot="start" url={user.avatar_url} name={user.name} />
                <IonLabel className="ion-text-wrap">
                  <h2>{user.name}</h2>
                  <IonNote>
                    Joined {formatDate(user.created_at)}
                    {user.invited_by_name ? ` · invited by ${user.invited_by_name}` : ' · root member'}
                    {roleLabel(user) ? ` · ${roleLabel(user)}` : ''}
                  </IonNote>
                  <IonNote color={user.newsletter_subscribed ? 'success' : 'medium'} className="ion-text-wrap" style={{ display: 'block' }}>
                    {user.newsletter_subscribed ? 'Subscribed to newsletter' : 'Not subscribed to newsletter'}
                  </IonNote>
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
