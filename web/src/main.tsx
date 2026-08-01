import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setupIonicReact } from '@ionic/react'
import { Capacitor } from '@capacitor/core'
import { CapacitorPasskey } from '@capgo/capacitor-passkey'

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

// Force Material Design on every platform (iOS, Android, web) — see CLAUDE.md Design system.
setupIonicReact({ mode: 'md' })

// Routes navigator.credentials.create/get to native passkey APIs when running
// in the wrapped iOS/Android app — see capacitor.config.ts and CLAUDE.md's
// Platform strategy. Explicitly gated to native: the plugin's web
// implementation isn't a transparent passthrough to the browser's own
// WebAuthn, so installing it unconditionally broke registration in a plain
// browser (confirmed locally — the ceremony hung indefinitely instead of
// reaching a real authenticator).
if (Capacitor.isNativePlatform()) {
  void CapacitorPasskey.autoShimWebAuthn()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
