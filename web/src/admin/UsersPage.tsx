import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { logInOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { formatDate } from '../format'
import { Avatar } from '../uploads/Avatar'
import { fetchAdminUsers, impersonateUser, type AdminUser } from './api'
import { ImpersonateModal, type ImpersonationTarget } from './ImpersonateModal'

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
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [impersonateTarget, setImpersonateTarget] = useState<ImpersonationTarget | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    fetchAdminUsers()
      .then(setUsers)
      .catch(() => setError(true))
  }, [])

  async function getSignInLink(user: AdminUser) {
    setImpersonating(user.id)
    try {
      const link = await impersonateUser(user.id)
      setImpersonateTarget({ memberName: user.name, url: link.url, expiresAt: link.expires_at })
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not create sign-in link')
    } finally {
      setImpersonating(null)
    }
  }

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
                {/* Feedback #87: a demo/impersonation sign-in link, per member. */}
                <IonButton
                  slot="end"
                  fill="clear"
                  disabled={impersonating === user.id}
                  onClick={() => void getSignInLink(user)}
                  title={`Get a sign-in link for ${user.name}`}
                >
                  {impersonating === user.id ? <IonSpinner name="dots" /> : <IonIcon slot="icon-only" icon={logInOutline} />}
                </IonButton>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
      <ImpersonateModal target={impersonateTarget} onDismiss={() => setImpersonateTarget(null)} />
      <IonToast isOpen={!!toast} message={toast ?? ''} duration={3000} onDidDismiss={() => setToast(null)} />
    </IonPage>
  )
}
