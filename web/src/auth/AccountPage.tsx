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
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { peopleOutline, shieldCheckmarkOutline } from 'ionicons/icons'

import { API_URL } from '../config'
import { useAuth } from './AuthContext'

// Reachable only once already signed in — JoinGate (see JoinGate.tsx) handles
// every sign-in/registration path before a route ever renders, so this page
// only needs to show who you are and let you log out.
export function AccountPage() {
  const { user, isLoading, isAdmin, logout } = useAuth()

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/events" />
          </IonButtons>
          <IonTitle>Account</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {isLoading && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}

        {!isLoading && user && (
          <IonList>
            <IonItem lines="none">
              {user.avatarUrl && (
                <img
                  slot="start"
                  src={`${API_URL}${user.avatarUrl}`}
                  alt=""
                  style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                />
              )}
              <IonLabel>
                <h2>{user.name}</h2>
              </IonLabel>
            </IonItem>
            {isAdmin && (
              <IonItem lines="none">
                <IonIcon slot="start" icon={shieldCheckmarkOutline} color="primary" />
                <IonLabel>Administrator</IonLabel>
              </IonItem>
            )}
            {isAdmin && (
              <IonItem lines="none" routerLink="/admin/users">
                <IonIcon slot="start" icon={peopleOutline} />
                <IonLabel>All members</IonLabel>
              </IonItem>
            )}
            <IonItem lines="none">
              <IonButton fill="outline" color="medium" onClick={logout}>
                Log out
              </IonButton>
            </IonItem>
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
