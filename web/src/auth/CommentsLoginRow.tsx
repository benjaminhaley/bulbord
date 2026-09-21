import { IonButton } from '@ionic/react'

import { unstyledButtonStyle } from '../theme/layout'
import { useRequireLogin } from './LoginPrompt'

// What an anonymous (or pending) visitor sees in place of a listing's
// comments (feedback #175) — comment authors are member PII, so the thread
// itself stays behind login. Deliberately quiet: plain gray text, not a
// bordered call-to-action, since it's not a major action on the page.
export function CommentsLoginRow() {
  const requireLogin = useRequireLogin()
  return (
    <div style={{ padding: '16px 0' }}>
      <IonButton
        fill="clear"
        onClick={() => requireLogin('Sign in to read and join the discussion')}
        style={{ ...unstyledButtonStyle, display: 'inline-flex', color: 'var(--ion-color-medium)', textDecoration: 'underline', fontSize: '0.875rem' }}
      >
        Sign in to see comments
      </IonButton>
    </div>
  )
}
