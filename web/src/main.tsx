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

// Force Material Design on every platform (iOS, Android, web) — see CLAUDE.md Design system.
setupIonicReact({ mode: 'md' })

// Bulbord is the platform brand; each institution's community lives at its
// own subdomain (nettlehorst.bulbord.com today). The bare platform domain
// shows a simple pointer instead of the invite-gated app — see CLAUDE.md
// Product shape.
const isPlatformRoot = window.location.hostname === 'bulbord.com'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isPlatformRoot ? <LandingPage /> : <App />}</StrictMode>,
)
