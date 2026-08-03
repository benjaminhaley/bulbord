import { IonBackButton, IonButtons, IonHeader, IonPage, IonText, IonTitle, IonToolbar } from '@ionic/react'

import { ProfileSetupScreen } from '../auth/JoinGate'

// Dev tool (feedback #44): the second step of the sign-up flow walkthrough
// started by InvitePreviewPage.tsx — the "set up your profile" screen a new
// member sees right after accepting an invite. Reuses ProfileSetupScreen,
// the exact same component the real flow renders, with preview={true} so
// the form is visibly present but genuinely inert (matching
// InviteAcceptCard's own busy={true} convention above it) — without that,
// tapping Continue here would actually overwrite the admin's own name/email
// via the real PATCH /auth/me call.
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
      <ProfileSetupScreen
        preview
        banner={
          <IonText color="medium">
            <p className="ion-padding-top">
              This is what a new member fills out right after accepting an invite. Inputs are disabled — preview only.
            </p>
          </IonText>
        }
      />
    </IonPage>
  )
}
