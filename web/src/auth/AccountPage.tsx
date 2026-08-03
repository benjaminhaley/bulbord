import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/react'
import { informationCircleOutline, shieldCheckmarkOutline } from 'ionicons/icons'

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
            {/* Tapping your profile picture gets you here (InstitutionBanner);
                admins can tap it again here to reach Developer Tools (feedback
                #38) — everyone else just sees their name, non-interactive. */}
            <IonItem lines="none" button={isAdmin} routerLink={isAdmin ? '/admin/dev-tools' : undefined} detail={isAdmin}>
              <Avatar slot="start" url={user.avatarUrl} name={user.name} />
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
            <IonItem button routerLink="/about" lines="none">
              <IonIcon slot="start" icon={informationCircleOutline} />
              <IonLabel>About</IonLabel>
            </IonItem>
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
