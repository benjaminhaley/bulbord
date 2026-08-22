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

// The gap between an <h2> and its first content element — a real gap found
// missing, not just misapplied, by the style audit (feedback #70, finding
// 02): "What to bring"'s <ul> and the Comments composer's wrapper div each
// had their own incidental margin (a list's default 4px, an unrelated 12px
// picked for a different reason), measured at 15.25px vs 37.25px on the
// same page for the identical heading-then-content relationship. Apply as
// an explicit marginTop on whatever element immediately follows an <h2>.
export const headingContentGap = { marginTop: 'var(--space-sm)' } as const

// The gap before a standalone CTA button that follows body text (View
// Booking Page, View Source) — measured at 2.25px before this token existed
// (finding 03), essentially touching the text above it, on both Camps' and
// Events' detail pages (the same unstyled pattern was ported from one to
// the other without anyone noticing). Distinct from sectionDividerStyle's
// gap, which marks a full section break — this is "give the button room
// without treating it as its own section."
export const leadingButtonGap = { marginTop: 'var(--space-md)' } as const

// An IonButton stripped back to look like whatever plain, chrome-less
// element it's replacing (a bare icon, a plain inline line of text, a
// dashed-border avatar circle) while staying a real button element
// underneath — keyboard operability, a focus ring, and ripple all come free,
// unlike a hand-rolled clickable div with an onClick handler (found missing
// across several components in a 2026-08-22 audit — see
// InstitutionBanner.tsx's own comment for the fuller story).
//
// A plain external CSS class doesn't reliably do this: `min-height` and
// `height` aren't exposed as Ionic custom properties on ion-button's host at
// all (verified in @ionic/core's own button.md.css — the default 36px comes
// from a literal value in the base `:host { ... }` rule, not a `var(--...)`
// a class could override), and `color` defaults to `--ion-color-primary`
// unless overridden per call site. An external class's `.foo { height: X }`
// is at the mercy of load-order/specificity against that same-specificity
// `:host` rule and measurably lost that fight in testing (min-height/height
// stayed at 36px even with a class rule setting them to `auto`) — a real,
// live-verified instance of this file's own "measure, don't assume"
// convention. A plain inline `style` object always wins over any external
// stylesheet regardless of specificity, so this is exported as one to be
// spread into each call site's own `style` prop, not a CSS class.
export const unstyledButtonStyle = {
  margin: 0,
  height: 'auto',
  minHeight: 'auto',
  color: 'inherit',
  fontSize: 'inherit',
  fontWeight: 'inherit',
  letterSpacing: 'normal',
  textTransform: 'none',
  '--padding-start': '0',
  '--padding-end': '0',
  '--padding-top': '0',
  '--padding-bottom': '0',
  '--background': 'transparent',
  '--background-hover': 'transparent',
  '--background-focused': 'transparent',
  '--background-activated': 'transparent',
  '--box-shadow': 'none',
} as const
