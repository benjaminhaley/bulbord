import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react'
import { closeOutline } from 'ionicons/icons'
import { useState } from 'react'
import { useHistory } from 'react-router-dom'

import { useAuth } from './AuthContext'

// General policy (see CLAUDE.md "Product shape"): anonymous visitors can see
// and attempt actions that require an account (star/dismiss an event today;
// any future gated action reuses this the same way), and get prompted to log
// in — with an explanation of what they're unlocking — rather than having
// the controls hidden outright.
export function useLoginPrompt() {
  const { user } = useAuth()
  const history = useHistory()
  const [explanation, setExplanation] = useState<string | null>(null)

  // Runs `action` if logged in, otherwise opens the prompt with `explanation`
  // instead — the one place the "is this action gated" check happens, so
  // call sites can't each independently get it wrong.
  function requireLogin(forExplanation: string, action: () => void) {
    if (!user) {
      setExplanation(forExplanation)
      return
    }
    action()
  }

  function goToLogin() {
    setExplanation(null)
    history.push('/account')
  }

  const loginPromptModal = (
    <IonModal isOpen={explanation !== null} onDidDismiss={() => setExplanation(null)}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Log In</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => setExplanation(null)}>
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p>{explanation}</p>
        <IonButton expand="block" onClick={goToLogin}>
          Log In
        </IonButton>
      </IonContent>
    </IonModal>
  )

  return { requireLogin, loginPromptModal }
}
