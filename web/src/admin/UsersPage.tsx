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
                <Avatar slot="start" url={user.avatar_url} />
                <IonLabel className="ion-text-wrap">
                  <h2>{user.name}</h2>
                  <IonNote>
                    Joined {formatDate(user.created_at)}
                    {user.invited_by_name ? ` · invited by ${user.invited_by_name}` : ' · root member'}
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
