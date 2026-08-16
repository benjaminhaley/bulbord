import { IonBackButton, IonButton, IonButtons, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

import { ProfileSetupWizard } from '../auth/ProfileSetupWizard'

// Dev tool (feedback #44, updated for feedback #88's stepped-onboarding
// redesign): the second step of the sign-up flow walkthrough started by
// InvitePreviewPage.tsx — the profile-setup screens a new member actually
// walks through right after accepting an invite. Reuses ProfileSetupWizard,
// the exact same component the real flow renders, with preview={true} —
// swapped in from the older single-page ProfileSetupScreen (still used by
// EditProfilePage.tsx for editing, not for first-time onboarding anymore)
// so this preview keeps matching what a real invitee actually sees. Every
// field/step/button stays genuinely interactive (feedback: a preview should
// let you actually fill out fields, step through the wizard, and click
// buttons, even though nothing has a real effect) — `preview` only makes the
// wizard's own finish() stop short of the real PATCH /auth/me call, and
// shows its own local "You're all set" completion screen instead of
// advancing past this page, same as the real flow. No disclaimer banner
// injected into the screen itself, for the same "exact reproduction" reason
// as InvitePreviewPage — the page title alone already says "preview." The
// "Next" link to FriendsPreviewPage.tsx lives in the header, always
// available regardless of wizard step, for the same reason InvitePreviewPage
// own "Next" does — never below the fold, and a way to skip ahead in the
// walkthrough without stepping through every field.
export function ProfileSetupPreviewPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/admin/invite-preview" />
          </IonButtons>
          <IonTitle>Sign-up Flow Preview</IonTitle>
          <IonButtons slot="end">
            <IonButton routerLink="/admin/friends-preview">Next</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <ProfileSetupWizard preview />
    </IonPage>
  )
}
