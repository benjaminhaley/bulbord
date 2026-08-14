import { IonBackButton, IonButtons, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'
import { useHistory } from 'react-router-dom'

import { useAuth } from './AuthContext'
import { ProfileSetupScreen } from './JoinGate'

// Splits the single stored `name` back into the first/last name fields the
// form uses — first word is firstName, everything else is lastName. Lossy
// for a genuinely multi-word first name, but this is the same split the
// form itself produces on save (`${firstName} ${lastName}`.trim()), so it
// round-trips correctly for the overwhelming majority of real names.
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = fullName.trim().split(/\s+/)
  return { firstName, lastName: rest.join(' ') }
}

// Lets an already-onboarded member see and edit everything the onboarding
// flow originally collected — name, email, photo, role, and (for Family)
// kids/grade — not just set it once at signup (feedback, 2026-08-14: "I
// should be able to see and edit... all onboarding information in my
// profile"). Reuses ProfileSetupScreen itself, prefilled from the real
// current user, rather than a second hand-built form — same validation,
// same photo/kids requirements, same crop step as the original flow.
export function EditProfilePage() {
  const { user } = useAuth()
  const history = useHistory()

  if (!user) return null
  const { firstName, lastName } = splitName(user.name)

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/account" />
          </IonButtons>
          <IonTitle>Edit Profile</IonTitle>
        </IonToolbar>
      </IonHeader>
      <ProfileSetupScreen
        submitLabel="Save"
        onSaved={() => history.push('/account')}
        initialValues={{
          firstName,
          lastName,
          email: user.email ?? '',
          avatarUrl: user.avatarUrl,
          newsletterSubscribed: user.newsletterSubscribed,
          role: user.role ?? undefined,
          roleOther: user.roleOther ?? '',
          kidGrades: user.kids.map((kid) => kid.grade),
        }}
      />
    </IonPage>
  )
}
