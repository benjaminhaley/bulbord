import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/react'
import { createOutline, informationCircleOutline, peopleOutline, shieldCheckmarkOutline } from 'ionicons/icons'

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
            {/* Tapping your profile picture gets you here (InstitutionBanner).
                The picture/name row itself is just identity, not a link
                (feedback #90) — the "Administrator" row below is what
                actually links to Developer Tools, same button+detail
                pattern as every other row on this page. */}
            <IonItem lines="none">
              <Avatar slot="start" url={user.avatarUrl} name={user.name} />
              <IonLabel>
                <h2>{user.name}</h2>
              </IonLabel>
            </IonItem>
            {isAdmin && (
              <IonItem button routerLink="/admin/dev-tools" detail lines="none">
                <IonIcon slot="start" icon={shieldCheckmarkOutline} color="primary" />
                <IonLabel>Administrator</IonLabel>
              </IonItem>
            )}
            <IonItem button routerLink="/account/edit" lines="none">
              <IonIcon slot="start" icon={createOutline} />
              <IonLabel>Edit Profile</IonLabel>
            </IonItem>
            <IonItem button routerLink="/friends" lines="none">
              <IonIcon slot="start" icon={peopleOutline} />
              <IonLabel>Friends</IonLabel>
            </IonItem>
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
