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

## Intentionality — the governing rule everything below follows from

Consistency is the default. If a font, color, weight, spacing value,
alignment, or any other typographic/design choice differs from how the same
kind of thing is treated elsewhere on the same screen (or elsewhere in the
app), that difference needs a reason you can state in one sentence — tied to
what the content actually *is* (its role, hierarchy, or state), not to how
it happened to get built.

Real reasons: a timestamp is secondary to the content it's attached to; a
table header is subordinate to the data it labels; a disabled/cancel action
is secondary to the primary action next to it; an empty-state placeholder
should recede. Not real reasons: "that's the component I reached for,"
"it was already like that," "nobody had looked at it yet." A style choice
made for a reason that can't survive being written down isn't a decision —
it's drift that hasn't been caught yet.

This is a two-way rule, not just a call for restraint: it means don't invent
a new treatment without a reason, *and* don't leave two things looking
different without one either. In practice: before shipping a screen, look
at every place something reads differently from its neighbors (a muted
color, a tighter or looser gap, a different weight) and be able to say why —
if you can't, make it match, don't leave it as a coin flip for whoever
looks next. This is the standard the audit process itself is now held to
(see the Known gaps section below) — checking that every visible difference
on a page is a real decision, not just checking that similar features match
each other.

`web/scripts/style-audit.mjs` is the reusable tool this standard runs on —
extracts real computed styles (not screenshots measured by eye) across the
app's main screens for whoever's doing the next pass to build on, rather
than re-deriving the technique from scratch (built and thrown away as
scratch scripts three times in one session before it was worth keeping).

## The standardization system: Ionic + a small token layer, not a redesign

Answering feedback #70's second question directly — "is there a good
system... that helps keep things standardized" — the answer is Ionic itself
(already true) plus two small additions that close the actual gap:

1. **`web/src/theme/tokens.css`** — spacing scale (`--space-2xs` through
   `--space-3xl`, Material's 4dp grid) and secondary/label type-scale tokens
   (`--type-body-secondary-size`, `--type-label-size`, etc.) as CSS custom
   properties, imported once in `main.tsx`.
2. **`web/src/theme/layout.ts`** — ready-made style objects
   (`factLineStyle`, `sectionDividerStyle`, `secondaryTextStyle`,
   `headingContentGap`, `leadingButtonGap`) built on those tokens, for the
   inline `style={{...}}` pattern this codebase already uses throughout
   rather than CSS classes. These promote patterns that were already proven
   correct through real feedback (or, for the last two, found missing
   entirely by a rigorous re-audit — see Known gaps below) into something
   any screen can import instead of re-deriving from scratch.

A living, visual version of both — type scale samples, a spacing ruler, the
Ionic color roles, a small component gallery — is in Storybook
(`web/.storybook`) under "Style Guide". Storybook already exists in this
repo (feedback #44) for exactly this kind of isolated-component reference;
it didn't need a second tool stood up alongside it.

Every story was published to Chromatic on push for a few days (automatic
pixel-diffing against the last-accepted baseline), but it was dropped
2026-08-16 after a cost/benefit look found it wasn't pulling real weight —
see `CLAUDE.md`'s Testing section for the full reasoning. What actually
catches future drift (like Events/Camps' divergence above) now is Claude
building Storybook and reviewing the rendered stories directly as part of
finishing any UI-touching change, rather than a pixel-diff queue nobody was
checking.

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

### Heading-to-content gap
The gap between an `<h2>` and its first content element uses
`headingContentGap` (`theme/layout.ts`), applied as an explicit `marginTop`
on that first element — not whatever incidental margin the element already
had for an unrelated reason. Found missing, not just misapplied, by the
feedback #70 re-audit: a bulleted list's default `4px` and a composer's
`12px` wrapper margin produced a measured 15.25px vs 37.25px gap for the
identical heading-then-content relationship, on the same page, with neither
value chosen on purpose.

### Pre-button gap
A standalone CTA button following body text (View Booking Page, View
Source) uses `leadingButtonGap` for its top margin — found missing (not
just on one page: the same unstyled pattern was ported from Camps to
Events without anyone noticing) by the same re-audit, measured at 2.25px
before the token existed.

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
model — a box can be centered while the glyphs inside it aren't. This is
also the standard to hold your *own* earlier measurement to: a real
misalignment can survive a "fixed, verified" claim if the verification
wasn't actually rigorous — before assuming a fresh report means the
environment changed (a different browser engine, a different device),
re-measure the evidence you already have. That's what actually explained a
report of this exact bug recurring after it was believed fixed (feedback
#70's second follow-up) — not a rendering difference, a measurement that
hadn't been redone.

### Table type
A dense data table (the Camps Options table) uses 14px cells against the
app's 16px body text elsewhere — a deliberate, stated exception for
information density, not an accident. If another table gets built, match
this: one step smaller than body text.

### List-header treatment can differ between tabs, with a reason
Events' Starred/New accordion headers and Camps' school-break headers look
different (compact icon+label rows vs. large bold dates) — confirmed
deliberate: Camps' headers *are* the information being scanned (real
calendar dates); Events' two buckets are static categories with nothing
comparable to scan. A content-shape difference, not drift — but it only
counts as a real decision because it's written down here, not because it
went unquestioned.

## Color
Use Ionic's `--ion-color-*` roles (Material's color-role system) rather
than a new hex value. Secondary/meta text specifically uses
`--ion-color-medium`, pinned at startup from
`events/theme.ts`'s `EVENT_CARD_SECONDARY_TEXT_COLOR` (also the newsletter
template's color, parity-checked in CI) — that's the one real source of
truth for "secondary gray text" anywhere in the app, in-app or in email.

**A second, unpinned gray was quietly coexisting with it** (feedback #70
re-audit, found by extracting real computed colors, not by eye): any bare
`<p>` under an `IonLabel`, and any `<IonNote>` with no explicit `color`
prop, don't resolve through `--ion-color-medium` at all — Ionic's own
`ion-label`/`ion-note` shadow CSS defaults to a *different* variable,
`--ion-color-step-600` (falling back to `#666666` if undefined), which this
app never set. Two grays, three RGB units apart, invisible to the eye,
real in the rendered page. Fixed once, at the root: `theme/tokens.css`
defines `--ion-color-step-600: var(--ion-color-medium)`, so every current
and future bare `<p>`/`<IonNote>` resolves to the same pinned color rather
than Ionic's raw default. Don't reach for a literal gray, `color="medium"`,
or a fresh CSS variable for "secondary text" anywhere — the default is
already correct now.

### When should supporting text actually be muted?
Muted text needs the same one-sentence-reason test as everything else
(see Intentionality above), and the reason has to be about the content's
*role*, not its location in the markup. Two real, different answers came
out of applying that test for real (feedback #70's third follow-up):

- **A list row's date/time/location stays muted.** They're genuinely
  supporting facts beneath the row's own title (the event/camp name) — the
  same "headline, then a supporting block" pattern a lot of well-designed
  list UIs use (a Mail app's subject line vs. its sender/snippet).
- **A feedback post's description is not muted**, even though it sits under
  an `<h2>` the same way a list row's facts do — because it isn't
  supporting detail about something else, it *is* the thing. Muting it was
  never a decision, just Ionic's default reaching further than anyone
  checked. `FeedbackItemBody` gives it an explicit `--ion-text-color`
  override for exactly this reason.

The structural position (below a heading, inside an `IonLabel`) doesn't
decide the answer by itself — what the text actually *is* does. When
adding a new muted-or-not call, ask which of these two shapes it's
actually closer to, not just what markup it happens to be inside.

## Known gaps (candidates for the audit, not yet fixed)
Camps' detail page went through roughly twenty rounds of hands-on visual
feedback (see `CLAUDE.md`'s Camps section); most of those fixes were never
ported back to Events, its sibling tab, even though the two are meant to
feel like one coherent app to a member. Two audit passes (feedback #70,
initial and re-audit) have since closed that gap for the areas checked —
this section is intentionally not "done" forever, since new screens and
new muted-vs-normal calls will keep coming; re-apply the Intentionality
test rather than assuming past passes covered everything.
