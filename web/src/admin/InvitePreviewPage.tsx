import { IonBackButton, IonButton, IonButtons, IonHeader, IonPage, IonText, IonTitle, IonToolbar } from '@ionic/react'

import { useAuth } from '../auth/AuthContext'
import { InviteAcceptCard } from '../auth/JoinGate'

// Dev tool (feedback #38, extended per feedback #44 into the first step of
// a full walkthrough): shows what a real invitee sees when they open your
// invite QR/link, without leaving your own signed-in session. Reuses
// InviteAcceptCard — the exact same component JoinGate.tsx's real join
// screen renders — with busy={true} so the buttons are visibly present but
// inert, rather than a separately hand-copied mockup that could drift from
// what the real join screen looks like.
export function InvitePreviewPage() {
  const { user } = useAuth()

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/admin/dev-tools" />
          </IonButtons>
          <IonTitle>Sign-up Flow Preview</IonTitle>
        </IonToolbar>
      </IonHeader>
      <InviteAcceptCard
        invite={user ? { name: user.name, avatarUrl: user.avatarUrl } : null}
        busy
        error={null}
        onAccept={() => {}}
        onSignIn={() => {}}
        banner={
          <IonText color="medium">
            <p>This is what someone sees when they open your invite link. Buttons are disabled — preview only.</p>
          </IonText>
        }
        footer={
          <IonButton expand="block" fill="clear" routerLink="/admin/profile-setup-preview" className="ion-margin-top">
            See the next step: setting up a profile →
          </IonButton>
        }
      />
    </IonPage>
  )
}
