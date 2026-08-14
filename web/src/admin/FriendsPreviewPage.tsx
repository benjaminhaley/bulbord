import { IonBackButton, IonButtons, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

import { ChooseFriendsScreen } from '../connections/ChooseFriendsScreen'

// Dev tool: the third step of the sign-up flow walkthrough started by
// InvitePreviewPage.tsx (feedback confirmed 2026-08-14, after the
// choose-friends onboarding step shipped, feedback #83) — reuses
// ChooseFriendsScreen, the exact same component the real flow renders, with
// preview={true} so "Add" and "Continue"/"Skip for now" stay genuinely
// clickable without actually mutating the admin's own connections or
// friends-step-completed state. No disclaimer banner, same "exact
// reproduction" reasoning as the other two preview pages.
export function FriendsPreviewPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/admin/profile-setup-preview" />
          </IonButtons>
          <IonTitle>Sign-up Flow Preview</IonTitle>
        </IonToolbar>
      </IonHeader>
      <ChooseFriendsScreen preview />
    </IonPage>
  )
}
