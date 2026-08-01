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

import { API_URL } from '../config'
import { fetchAdminUsers, type AdminUser } from './api'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
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
                {user.avatar_url && (
                  <img
                    slot="start"
                    src={`${API_URL}${user.avatar_url}`}
                    alt=""
                    style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                  />
                )}
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
