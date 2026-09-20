import { IonButton, IonButtons, IonHeader, IonModal, IonPage, IonTitle, IonToolbar } from '@ionic/react'
import { type ComponentType, createContext, type ReactNode, useCallback, useContext, useState } from 'react'

import { useAuth } from './AuthContext'
import { LoginCard } from './JoinGate'

// Feedback #175: the app is browsable without an account, so anything that
// needs one (starring, posting, comments, who's-interested, Feedback, Friends,
// Account...) asks for a login at the moment it's tapped instead of the whole
// app sitting behind a wall. `requireLogin()` is the one call every such
// action makes: it returns true when the visitor is a real member (go ahead),
// otherwise opens the sign-in/create-account sheet and returns false (stop).
interface LoginPromptState {
  requireLogin: (reason?: string) => boolean
}

const LoginPromptContext = createContext<LoginPromptState | null>(null)

export function LoginPromptProvider({ children }: { children: ReactNode }) {
  const { user, pendingUser } = useAuth()
  const [reason, setReason] = useState<string | undefined>()
  const [open, setOpen] = useState(false)

  const requireLogin = useCallback(
    (why?: string) => {
      if (user) return true
      setReason(why)
      setOpen(true)
      return false
    },
    [user],
  )

  return (
    <LoginPromptContext.Provider value={{ requireLogin }}>
      {children}
      {/* Closes itself once a real member exists, and as soon as a fresh
          signup exists too — JoinGate then shows the profile wizard, which
          this sheet would otherwise sit on top of. A pending account with a
          finished profile keeps it (it's how "waiting for approval" is
          explained when they tap something gated). */}
      <IonModal isOpen={open && !user && !(pendingUser && !pendingUser.profileComplete)} onDidDismiss={() => setOpen(false)}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Nettelhorst Bulbord</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setOpen(false)}>Close</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <LoginCard reason={reason} />
      </IonModal>
    </LoginPromptContext.Provider>
  )
}

export function useRequireLogin() {
  const context = useContext(LoginPromptContext)
  if (!context) throw new Error('useRequireLogin must be used within a LoginPromptProvider')
  return context.requireLogin
}

// Route-level version for whole pages that only make sense signed in (the
// Feedback tab, Friends, Account, Notifications): the tab/link is still
// visible and tappable, and landing on it shows the sign-in card in place of
// the page — same "click it and it asks you to log in" behavior as an
// in-page action, without a page that would only render empty errors.
function LoginRequiredPage({ reason }: { reason: string }) {
  return (
    <IonPage>
      <LoginCard reason={reason} />
    </IonPage>
  )
}

export function requiresLogin(Component: ComponentType, reason: string): ComponentType {
  function Gated() {
    const { user } = useAuth()
    return user ? <Component /> : <LoginRequiredPage reason={reason} />
  }
  Gated.displayName = `RequiresLogin(${Component.displayName ?? Component.name})`
  return Gated
}
