// Shared design token — deliberately kept byte-identical between
// web/src/events/theme.ts and api/src/newsletter/theme.ts (see the parity
// note atop format.ts in either directory; enforced by
// scripts/check-format-parity.mjs).
//
// This is the color the in-app event card actually renders its secondary
// text in (the "when"/location/description-teaser/interested-count lines):
// web/src/main.tsx sets Ionic's --ion-color-medium from this constant at
// startup (rather than relying on Ionic's own same-valued default), so this
// is a real, live source of truth rather than a coincidence two places
// happen to agree on. If you change the app's secondary-text color, change
// it here — main.tsx and the newsletter template both read from this
// constant (feedback #36 — the newsletter had previously invented its own
// unrelated green for this line).
export const EVENT_CARD_SECONDARY_TEXT_COLOR = '#636469'
