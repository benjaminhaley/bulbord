import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setupIonicReact } from '@ionic/react'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

import '@ionic/react/css/core.css'
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/structure.css'
import '@ionic/react/css/typography.css'
import '@ionic/react/css/padding.css'
import '@ionic/react/css/float-elements.css'
import '@ionic/react/css/text-alignment.css'
import '@ionic/react/css/text-transformation.css'
import '@ionic/react/css/flex-utils.css'
import '@ionic/react/css/display.css'

import './index.css'
import { App } from './app/App.tsx'
import { setToken } from './auth/token.ts'
import { LandingPage } from './landing/LandingPage.tsx'
import { EVENT_CARD_SECONDARY_TEXT_COLOR } from './events/theme.ts'

// A one-tap sign-in link (?signInToken=<session token>) — lets someone who
// can't do the normal invite+passkey ceremony themselves (an App Store
// reviewer on an unfamiliar device, most notably) land on a fully signed-in
// view with nothing to read or type. Same trust model as the existing
// ?invite=/?rootSecret= query-param mechanisms below: a valid session token
// is the same credential normal login already stores in localStorage, this
// just offers a URL as the delivery mechanism instead of the passkey
// ceremony. Stripped from the visible URL immediately so it doesn't linger
// in browser history once used.
const signInToken = new URLSearchParams(window.location.search).get('signInToken')
if (signInToken) {
  setToken(signInToken)
  const url = new URL(window.location.href)
  url.searchParams.delete('signInToken')
  window.history.replaceState({}, '', url)
}

// The native app's WKWebView has its own storage sandbox, completely
// separate from mobile Safari — a link (including the sign-in link above)
// only ever reaches this file's URL-parsing logic if it opens *inside* the
// app, not the system browser. Universal Links land here, on this native
// event, when the app is already installed; a full navigation re-runs this
// file fresh against the incoming URL, same as a normal page load.
if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    window.location.href = url
  })
}

// Force Material Design on every platform (iOS, Android, web) — see CLAUDE.md Design system.
setupIonicReact({ mode: 'md' })

// Pins Ionic's --ion-color-medium to the same constant the newsletter
// template imports (api/src/newsletter/theme.ts, kept byte-identical to
// events/theme.ts by scripts/check-format-parity.mjs), rather than letting
// the app rely on Ionic's own default — this way the constant is the real,
// live source of truth for the event card's secondary text color, not just
// documentation that happens to agree with it (feedback #36).
document.documentElement.style.setProperty('--ion-color-medium', EVENT_CARD_SECONDARY_TEXT_COLOR)

// Bulbord is the platform brand; each institution's community lives at its
// own subdomain (nettelhorst.bulbord.com today). The bare platform domain
// shows a simple pointer instead of the invite-gated app — see CLAUDE.md
// Product shape.
const isPlatformRoot = window.location.hostname === 'bulbord.com'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isPlatformRoot ? <LandingPage /> : <App />}</StrictMode>,
)
