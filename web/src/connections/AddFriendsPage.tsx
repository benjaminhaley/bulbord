import { IonBackButton, IonButtons, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'
import { useHistory } from 'react-router-dom'

import { ChooseFriendsScreen } from './ChooseFriendsScreen'

// Reached from FriendsPage's "Add more friends" prompt (feedback #91) — the
// same ChooseFriendsScreen shown once during onboarding, now also reachable
// any time after. onFinished routes back to /friends once Done is tapped.
export function AddFriendsPage() {
  const history = useHistory()
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/friends" />
          </IonButtons>
          <IonTitle>Add Friends</IonTitle>
        </IonToolbar>
      </IonHeader>
      <ChooseFriendsScreen onFinished={() => history.push('/friends')} />
    </IonPage>
  )
}
