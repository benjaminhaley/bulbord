import { IonBackButton, IonButtons, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

import { ProfileSetupScreen } from '../auth/JoinGate'

// Dev tool (feedback #44): the second step of the sign-up flow walkthrough
// started by InvitePreviewPage.tsx — the "set up your profile" screen a new
// member sees right after accepting an invite. Reuses ProfileSetupScreen,
// the exact same component the real flow renders, with preview={true}. Every
// field and button stays genuinely interactive (feedback: a preview should
// let you actually fill out fields and click buttons, e.g. to check the role
// picker or try the photo crop step, even though nothing has a real effect)
// — `preview` only makes ProfileSetupScreen's own submit() stop short of the
// real PATCH /auth/me call, which would otherwise overwrite the admin's own
// name/email. No disclaimer banner injected into the screen itself, for the
// same "exact reproduction" reason as InvitePreviewPage — the page title
// alone already says "preview."
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
