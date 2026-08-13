// Shared inline-style building blocks for the hand-rolled detail-page
// sections Ionic's own components don't cover (short fact lines, section
// dividers, secondary/meta text) — built on the spacing scale in
// tokens.css. See STYLE_GUIDE.md.
//
// factLineStyle and sectionDividerStyle formalize a pattern that was
// already proven correct through real feedback on the Camps detail page
// (CampDetailPage.tsx's local FACT_LINE_STYLE/SECTION_DIVIDER_STYLE
// constants, 2026-08-05 — see CLAUDE.md's Camps section) but lived as a
// file-local const, so it was never available to any other screen (Events'
// detail page still uses un-styled <p> tags with the browser's default
// ~1em margin as of this writing). Promoting it here is what makes "port
// this fix to Events" an import instead of a re-derivation.

// One consistent rhythm for every short fact line in a detail page (date,
// time, stat line, address, description, etc.) — tighter than the
// browser's default paragraph margin, matching the rhythm a bulleted list
// (ul/li) already reads at, so a whole page of short facts feels like one
// block instead of a stack of loosely-spaced paragraphs.
export const factLineStyle = { margin: `var(--space-2xs) 0` } as const

// Secondary/meta text (a "Posted by {name}" line, a comment's timestamp) —
// same secondary color the event/camp card list rows already use
// (events/theme.ts's EVENT_CARD_SECONDARY_TEXT_COLOR, live as
// --ion-color-medium), sized down to the Body-secondary token rather than
// left at the surrounding text's full body size.
export const secondaryTextStyle = {
  color: 'var(--ion-color-medium)',
  fontSize: 'var(--type-body-secondary-size)',
  lineHeight: 'var(--type-body-secondary-line-height)',
} as const

// A thin rule marking a genuine section boundary (Options / What to bring /
// Comments / Booking on the Camps detail page) — a heading's own spacing
// alone reads as too subtle a break on a page with several sections.
export const sectionDividerStyle = {
  border: 'none',
  borderTop: '1px solid var(--ion-color-step-150, #d9d9d9)',
  margin: 'var(--space-lg) 0 0',
} as const
