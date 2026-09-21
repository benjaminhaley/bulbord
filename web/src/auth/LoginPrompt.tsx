import { IonBackButton, IonButtons, IonHeader, IonPage, IonToolbar } from '@ionic/react'
import { type ComponentType, useCallback, useEffect } from 'react'
import { Redirect, useHistory, useLocation } from 'react-router-dom'

import { useAuth } from './AuthContext'
import { LoginCard } from './JoinGate'

// Feedback #175: the app is browsable without an account, so anything that
// needs one (starring, posting, comments, who's-interested, Feedback, Friends,
// Account...) sends the visitor to a real `/login` page at the moment it's
// tapped, rather than the whole app sitting behind a wall. It's a route, not
// a modal or a component state, so the URL is shareable/bookmarkable and the
// browser (or native) back button returns to exactly where they were.
//   /login?reason=<why they were sent here>&next=<where to go once signed in>
export function loginPath(reason: string | undefined, next: string): string {
  const params = new URLSearchParams()
  if (reason) params.set('reason', reason)
  params.set('next', next)
  return `/login?${params.toString()}`
}

// `next` comes from the URL, so it must be an in-app path — never another
// origin (`//evil.com`) and never /login itself (would loop).
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/login')) return '/events'
  return next
}

// `requireLogin()` is the one call every gated action makes: true for a real
// member (go ahead), otherwise navigates to /login and returns false (stop).
export function useRequireLogin() {
  const { user } = useAuth()
  const history = useHistory()
  const location = useLocation()
  return useCallback(
    (reason?: string) => {
      if (user) return true
      history.push(loginPath(reason, `${location.pathname}${location.search}`))
      return false
    },
    [user, history, location.pathname, location.search],
  )
}

export function LoginPage() {
  const { user } = useAuth()
  const history = useHistory()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const reason = params.get('reason') ?? undefined
  const next = safeNext(params.get('next'))

  // Signing in (or the passkey ceremony finishing) makes `user` appear —
  // replace, not push, so back doesn't return to the login page.
  // Only while this page is actually the current one: the router outlet keeps
  // it mounted (hidden) after navigating away, where `location` is already
  // the destination and there's no `next` param left to read.
  const onLoginPage = location.pathname === '/login'
  useEffect(() => {
    if (user && onLoginPage) history.replace(next)
  }, [user, onLoginPage, next, history])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/events" />
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <LoginCard reason={reason} onBrowse={() => history.replace(next)} />
    </IonPage>
  )
}

// Route-level version for whole pages that only make sense signed in (the
// Feedback tab, Friends, Account, Notifications): the tab/link stays visible
// and tappable, and landing on it redirects (replacing, so back doesn't
// bounce between the two) to /login, which returns here once signed in.
export function requiresLogin(Component: ComponentType, reason: string): ComponentType {
  function Gated() {
    const { user } = useAuth()
    const location = useLocation()
    if (user) return <Component />
    // Ionic's router outlet keeps the page you navigated away from mounted
    // (hidden), and `useLocation` there reports the *current* URL. Without
    // this guard, landing on /login re-fires this redirect from the hidden
    // gated page and nests /login inside its own `next` param.
    if (location.pathname.startsWith('/login')) return null
    return <Redirect to={loginPath(reason, `${location.pathname}${location.search}`)} />
  }
  Gated.displayName = `RequiresLogin(${Component.displayName ?? Component.name})`
  return Gated
}
