import { IonButton, IonIcon } from '@ionic/react'
import { chatbubblesOutline } from 'ionicons/icons'

import { useRequireLogin } from './LoginPrompt'

// What an anonymous (or pending) visitor sees in place of a listing's
// comments (feedback #175) — comment authors are member PII, so the thread
// itself stays behind login; this row is the tap target that asks for it.
export function CommentsLoginRow() {
  const requireLogin = useRequireLogin()
  return (
    <div style={{ padding: '16px 0' }}>
      <IonButton fill="outline" expand="block" onClick={() => requireLogin('Sign in to read and join the discussion')}>
        <IonIcon slot="start" icon={chatbubblesOutline} />
        Sign in to see comments
      </IonButton>
    </div>
  )
}
