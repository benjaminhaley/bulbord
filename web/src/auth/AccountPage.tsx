import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/react'
import { peopleOutline, shieldCheckmarkOutline } from 'ionicons/icons'

import { Avatar } from '../uploads/Avatar'
import { useAuth } from './AuthContext'

// Reachable only once already signed in — JoinGate (see JoinGate.tsx) handles
// every sign-in/registration path before a route ever renders, so this page
// only needs to show who you are and let you log out.
export function AccountPage() {
  const { user, isAdmin, logout } = useAuth()

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
        {user && (
          <IonList>
            <IonItem lines="none">
              <Avatar slot="start" url={user.avatarUrl} />
              <IonLabel>
                <h2>{user.name}</h2>
              </IonLabel>
            </IonItem>
            {isAdmin && (
              <>
                <IonItem lines="none">
                  <IonIcon slot="start" icon={shieldCheckmarkOutline} color="primary" />
                  <IonLabel>Administrator</IonLabel>
                </IonItem>
                <IonItem lines="none" routerLink="/admin/users">
                  <IonIcon slot="start" icon={peopleOutline} />
                  <IonLabel>All members</IonLabel>
                </IonItem>
              </>
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
