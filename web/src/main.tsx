import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setupIonicReact } from '@ionic/react'

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
import { LandingPage } from './landing/LandingPage.tsx'
import { EVENT_CARD_SECONDARY_TEXT_COLOR } from './events/theme.ts'

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
