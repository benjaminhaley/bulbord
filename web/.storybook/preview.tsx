import type { Preview } from '@storybook/react-vite'
import { setupIonicReact } from '@ionic/react'
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
          <Story />
        </AuthProvider>
      </MemoryRouter>
    ),
  ],
};

export default preview;