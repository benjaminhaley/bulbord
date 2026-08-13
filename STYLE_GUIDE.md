# Bulbord — Style Guide

Feedback #70: the app's spacing/fonts/layout had drifted inconsistent across
screens, and there was no single place stating the rules — every round of
visual feedback got fixed locally, in whichever file was on screen at the
time, with no durable reference for the next screen to follow. This doc is
that reference. It states current, present-tense rules only; for the
history of *why* each rule exists (the specific feedback, screenshots, and
corrections that produced it), see `CLAUDE.md`'s Camps section, which this
doc consolidates and points back to rather than repeats.

## Inherited from Material Design 3, not invented here

Bulbord's component library is [Ionic React](https://ionicframework.com/),
forced into Material Design mode on every platform (`setupIonicReact({
mode: 'md' })` — see `CLAUDE.md`'s Design system section). That decision
already commits the app to [Material Design 3](https://m3.material.io) as
its external design system — Ionic's md mode implements Material's
component shapes, elevation, and ripple behavior directly. What Ionic's md
mode does *not* provide is a spacing scale or a type scale for the
hand-rolled sections every detail page eventually needs (fact lines,
tables, secondary/meta text) — components alone don't cover free-standing
text and layout, and that gap is exactly where the ad hoc pixel values
(`margin: 8`, `fontSize: 12`, `fontSize: '0.75em'`, hand-guessed negative
margins) crept in across different files independently. The tokens below
close that gap using Material 3's own published values
([spacing](https://m3.material.io/styles/spacing/tokens),
[type scale](https://m3.material.io/styles/typography/type-scale-tokens)) —
extending the same external standard the app already committed to, not
adding a second one.

## The standardization system: Ionic + a small token layer, not a redesign

Answering feedback #70's second question directly — "is there a good
system... that helps keep things standardized" — the answer is Ionic itself
(already true) plus two small additions that close the actual gap:

1. **`web/src/theme/tokens.css`** — spacing scale (`--space-2xs` through
   `--space-3xl`, Material's 4dp grid) and secondary/label type-scale tokens
   (`--type-body-secondary-size`, `--type-label-size`, etc.) as CSS custom
   properties, imported once in `main.tsx`.
2. **`web/src/theme/layout.ts`** — ready-made style objects
   (`factLineStyle`, `sectionDividerStyle`, `secondaryTextStyle`) built on
   those tokens, for the inline `style={{...}}` pattern this codebase
   already uses throughout rather than CSS classes. These promote a pattern
   that was already proven correct through real feedback on the Camps
   detail page (its local `FACT_LINE_STYLE`/`SECTION_DIVIDER_STYLE`
   constants) into something any other screen can import instead of
   re-deriving from scratch.

A living, visual version of both — type scale samples, a spacing ruler, the
Ionic color roles, a small component gallery — is in Storybook
(`web/.storybook`) under "Style Guide". Storybook already exists in this
repo (feedback #44) for exactly this kind of isolated-component reference;
it didn't need a second tool stood up alongside it.

**Deliberately not proposed:** a new component library or CSS framework
(Tailwind, a design-system package) on top of Ionic, or decomposing every
hand-styled value into a token. Ionic already is the standardization
system for anything it renders (buttons, items, toolbars, modals) — see
`CLAUDE.md`: *"Use Ionic's built-in components... don't hand-roll UI
primitives Ionic already provides."* The token layer above exists only for
the residual, real gap: free-standing text/layout in detail-page sections
that Ionic's components don't reach. Keep it that small.

## Rules

### Component library
Use Ionic's built-in components for anything it provides — lists, items,
buttons, modals, accordions, toolbars, badges. Reach for a hand-rolled
`<div>`/`<table>`/flexbox layout only for the residual cases Ionic has no
component for (e.g. the Camps Options table, a tabular comparison Ionic
doesn't ship a component for) — and even then, prefer composing Ionic
primitives (`IonItem`, `IonLabel`, `IonRadio`) over reaching for a
higher-level Ionic convenience wrapper that can't do what's needed (see
`CLAUDE.md`'s `RolePicker` note: `IonSelect` structurally can't show
secondary text, so it was replaced by composing `IonModal`/`IonRadioGroup`
directly — still standard Ionic primitives, not a hand-rolled equivalent).

### Spacing
Use the tokens in `theme/tokens.css` (`--space-2xs` … `--space-3xl`)
instead of a bare pixel number in a new inline style. They're the same
values already in organic use across the app, just named and centralized —
adopting them in existing code is a mechanical rename, not a re-numbering,
and doesn't need to happen everywhere at once.

### Fact lines (short stat lines in a detail page)
Use `factLineStyle` from `theme/layout.ts` on every short fact line (date,
time, stat line, address, description) instead of an unstyled `<p>`, which
falls back to the browser's ~1em default margin and reads as loose next to
tighter list/table rhythm elsewhere on the same page. Real `<h1>`/`<h2>`
headings keep their own larger spacing — that's an intentional section
break, not an inconsistency.

### Section dividers
A page with more than one real section (Options, What to bring, Comments,
Booking) gets a thin `<hr>` (`sectionDividerStyle`) immediately before each
section's heading, not just heading whitespace — confirmed insufficient on
its own via direct feedback on the Camps detail page.

### Always label an unknown value; drop the label once it's self-evident
A field that can genuinely be missing (no published price, no stated age
range) still renders — explicitly labeled ("Price: not published") — rather
than being silently omitted, so the *set* of fields shown is consistent
across every listing. Once a real value is known, drop the label if the
value's own shape already says what it is (a `$` sign is obviously a price,
"mi" is obviously a distance, am/pm is obviously a time) — restating
"Price:" in front of a dollar sign is redundant, not helpful. Keep the
label when the value has no self-evident unit (a bare age range, "5-12",
needs "Ages:" in front of it).

### Never show the same fact twice
Don't repeat a title, stat, or heading that's already visible elsewhere on
the same screen — including across a persistent header. A page's `<h1>`
duplicating its own toolbar `IonTitle` (which stays visible through the
whole scroll) is the concrete case this caught on the Camps detail page.

### Time formatting
"9 am – 1 pm", "9:30 – 11 am", "noon – 3:30 pm": omit `:00` minutes,
lowercase `am`/`pm` with no periods, "noon"/"midnight" instead of
"12 pm"/"12 am", and show `am`/`pm` once at the end of a range when both
sides share it, on both ends only when they differ. One canonical
implementation per data source — see the Known gaps section below for
where this still needs porting.

### Bulleted lists (packing lists, structured notes)
Every bullet either bolds its lead-in label or none do — a colon-less
"general note" exception previously produced a visibly inconsistent list
and was removed entirely. A label's own detail renders as a block-level
line under the bold label inside the same `<li>` (one bullet, not two), not
inline after a colon.

### Icon alignment
Vertically centering a slotted icon against adjacent text by hand-tuning
flexbox `alignItems`/`margin` is unreliable against Ionic's own shadow-DOM
components (`ion-textarea`'s internal padding isn't symmetric the way a
plain `<input>`'s is) and took multiple guessed attempts to get right on
the Camps comment composer. Use `IonItem` with `IonIcon slot="start"` (or
`slot="end"`) instead — Ionic's own item layout handles this correctly by
construction. If a genuine pixel-level misalignment does need diagnosing
directly, screenshot at a high device-scale-factor and measure the actual
rendered ink (e.g. a brightness-weighted centroid), not the element's box
model — a box can be centered while the glyphs inside it aren't.

## Color
Use Ionic's `--ion-color-*` roles (Material's color-role system) rather
than a new hex value. Secondary/meta text specifically uses
`--ion-color-medium`, pinned at startup from
`events/theme.ts`'s `EVENT_CARD_SECONDARY_TEXT_COLOR` (also the newsletter
template's color, parity-checked in CI) — that's the one real source of
truth for "secondary gray text" anywhere in the app, in-app or in email.

## Known gaps (candidates for the audit, not yet fixed)
Camps' detail page went through roughly twenty rounds of hands-on visual
feedback (see `CLAUDE.md`'s Camps section); most of those fixes were never
ported back to Events, its sibling tab, even though the two are meant to
feel like one coherent app to a member. This doc states the rule going
forward — applying it retroactively to Events (and anywhere else it was
missed) is exactly what the feedback #70 audit covers next.
