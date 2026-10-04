import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
  cleanup()
  // Ionic moves a presented overlay out of the React tree into <body>, so
  // RTL's cleanup leaves it behind. (An overlay still mid-present when a test
  // ends can land after this runs — tests wait for the present instead; see
  // AddEventModal.test.tsx's waitUntilModalPresented.)
  document.body.querySelectorAll('ion-modal, ion-action-sheet, ion-popover, ion-alert, ion-toast, ion-loading').forEach((el) => el.remove())
})

// jsdom doesn't implement matchMedia; Ionic's overlay components (modals,
// popovers) query it for safe-area/breakpoint handling on present().
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
