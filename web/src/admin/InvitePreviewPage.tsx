import { IonBackButton, IonButton, IonButtons, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

import { useAuth } from '../auth/AuthContext'
import { InviteAcceptCard } from '../auth/JoinGate'

// Dev tool (feedback #38, extended per feedback #44 into the first step of
// a full walkthrough): shows what a real invitee sees when they open your
// invite QR/link, without leaving your own signed-in session. Reuses
// InviteAcceptCard — the exact same component JoinGate.tsx's real join
// screen renders — with busy={true} so the buttons are visibly present but
// inert, rather than a separately hand-copied mockup that could drift from
// what the real join screen looks like. Deliberately no disclaimer text
// injected into the card itself (an earlier version did this via the
// `banner` prop) — Ben found that broke "exact reproduction," which is the
// whole point of reusing the real component; the page's own title plus the
// visibly-disabled controls already say "preview" without interrupting the
// real screen's content. The "next step" link lives in the header instead
// of inline content for the same reason, and so it's never below the fold.
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
          <IonButtons slot="end">
            <IonButton routerLink="/admin/profile-setup-preview">Next</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <InviteAcceptCard
        invite={user ? { name: user.name, avatarUrl: user.avatarUrl } : null}
        busy
        error={null}
        onAccept={() => {}}
        onSignIn={() => {}}
      />
    </IonPage>
  )
}
