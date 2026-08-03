import { IonBackButton, IonButtons, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

import { ProfileSetupScreen } from '../auth/JoinGate'

// Dev tool (feedback #44): the second step of the sign-up flow walkthrough
// started by InvitePreviewPage.tsx — the "set up your profile" screen a new
// member sees right after accepting an invite. Reuses ProfileSetupScreen,
// the exact same component the real flow renders, with preview={true} so
// the form is visibly present but genuinely inert (matching
// InviteAcceptCard's own busy={true} convention above it) — without that,
// tapping Continue here would actually overwrite the admin's own name/email
// via the real PATCH /auth/me call. No disclaimer banner injected into the
// screen itself, for the same "exact reproduction" reason as
// InvitePreviewPage — the page title and disabled controls already say
// "preview" on their own.
export function ProfileSetupPreviewPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/admin/invite-preview" />
          </IonButtons>
          <IonTitle>Sign-up Flow Preview</IonTitle>
        </IonToolbar>
      </IonHeader>
      <ProfileSetupScreen preview />
    </IonPage>
  )
}
