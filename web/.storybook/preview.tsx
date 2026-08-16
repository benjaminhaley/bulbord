import type { Preview } from '@storybook/react-vite'
import { IonApp, setupIonicReact } from '@ionic/react'
import { MemoryRouter } from 'react-router-dom'

import { mswHandlers } from './msw-handlers'

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

import '../src/theme/tokens.css'
import '../src/index.css'
import { AuthProvider } from '../src/auth/AuthContext'
import { EVENT_CARD_SECONDARY_TEXT_COLOR } from '../src/events/theme'

// Mirrors main.tsx's real app bootstrap — same mode, same CSS, same
// --ion-color-medium override — so stories render with the app's actual
// look, not Ionic's un-configured defaults.
setupIonicReact({ mode: 'md' })
document.documentElement.style.setProperty('--ion-color-medium', EVENT_CARD_SECONDARY_TEXT_COLOR)

const preview: Preview = {
  parameters: {
    msw: { handlers: mswHandlers },
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        {/* Real AuthProvider, not a mock — with no session token in
            Storybook's browser (see auth/token.ts), fetchCurrentUser()
            short-circuits to null with no network call, so this is safe
            and gives stories the exact same auth wiring the real app uses. */}
        <AuthProvider>
          {/* App.tsx's real root always has IonApp above any IonContent —
              it's what gives ion-app (and everything under it) a real,
              non-zero height via Ionic's own position:absolute;inset:0 CSS.
              Without it, a story's IonContent has no height to resolve
              height:100% against, collapses to 0px, and every child renders
              with a real DOM position but gets visually clipped out — every
              story looked broken in Chromatic until this was added. */}
          <IonApp>
            <Story />
          </IonApp>
        </AuthProvider>
      </MemoryRouter>
    ),
  ],
};

export default preview;