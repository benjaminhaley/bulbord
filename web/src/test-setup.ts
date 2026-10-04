import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
  cleanup()
  // Ionic portals a presented overlay out of the React tree and removes it
  // asynchronously after dismissal, so RTL's cleanup can leave it in the DOM
  // for the next test. On a slow CI runner that stale copy was what
  // document.querySelector found (feedback #180's AddEventModal test): its
  // React tree was already unmounted, so events dispatched on it did nothing.
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
