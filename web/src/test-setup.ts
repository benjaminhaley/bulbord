import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
  cleanup()
  // Ionic moves a presented overlay out of the React tree into <body>, so
  // RTL's cleanup leaves it behind. (An overlay still presenting/dismissing
  // when a test ends can land after this runs; see AddEventModal.test.tsx's
  // openModal/afterEach for the pattern that avoids it.)
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

// jsdom doesn't implement element scrolling; IonSegment scrolls its active
// button into view whenever the value changes (AddEventModal's event tabs).
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {}
}
