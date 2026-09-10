import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/react'
import { createOutline, flaskOutline, informationCircleOutline, notificationsOutline, peopleOutline, shieldCheckmarkOutline } from 'ionicons/icons'

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
                actually links to Developer Tools, same plain button pattern
                (no detail arrow) as every other row on this page. */}
            <IonItem lines="none">
              <Avatar slot="start" url={user.avatarUrl} name={user.name} />
              <IonLabel>
                <h2>{user.name}</h2>
              </IonLabel>
            </IonItem>
            {isAdmin && (
              <IonItem button routerLink="/admin/dev-tools" lines="none">
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
            <IonItem button routerLink="/account/notification-settings" lines="none">
              <IonIcon slot="start" icon={notificationsOutline} />
              <IonLabel>Notification Settings</IonLabel>
            </IonItem>
            <IonItem button routerLink="/about" lines="none">
              <IonIcon slot="start" icon={informationCircleOutline} />
              <IonLabel>About</IonLabel>
            </IonItem>
            {/* Deliberately unlabeled-as-such in the tab bar/nav — reachable
                only by a member who happens to open Account and notice this
                row, same low-visibility posture as the Administrator row
                above. Currently just Soccer Math (see LabsPage.tsx), a
                buried, standalone multiplication-practice game that lives
                outside the SPA entirely (web/public/soccer-math/) so a kid
                can open it with no login. */}
            <IonItem button routerLink="/labs" lines="none">
              <IonIcon slot="start" icon={flaskOutline} />
              <IonLabel>Labs</IonLabel>
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
