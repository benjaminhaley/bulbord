import { fileURLToPath } from 'node:url'

import { expect, type BrowserContext, type Page } from '@playwright/test'

// Shared by passkey-auth.spec.ts (the real end-to-end invite/passkey flow,
// Chromium only) and webkit-onboarding.spec.ts (a real-WebKit cross-browser
// pass over the same onboarding UI — see that file's own header for why it
// exists as a separate spec rather than a second Chromium-only run).

// Any real, decodable image works as the profile-photo fixture; this one's
// already in the repo, so no new small test asset is needed. Deliberately
// NOT used by webkit-onboarding.spec.ts, which needs a photo whose natural
// size is much larger than its on-screen crop box to exercise the bug that
// spec exists to guard — this 80x81 logo is too close to its own display
// size to ever trigger it.
export const FIXTURE_PHOTO_PATH = fileURLToPath(new URL('../public/nettelhorst-logo.png', import.meta.url))

// CI's UPLOADS_* env vars are deliberately non-functional (see
// .github/workflows/ci.yml — UPLOADS_ENDPOINT: http://localhost:0) since no
// e2e spec ever needed a real upload to succeed before the photo step
// became required (feedback #82). Rather than wiring real object-storage
// credentials into CI just for this, POST /uploads is mocked at the network
// level — the same approach Playwright itself recommends for a dependency
// this test doesn't actually need to exercise for real. The client-side
// crop-to-blob work (the part that actually had the WebKit bug) still runs
// for real either way — only the network round-trip afterward is faked.
export async function mockPhotoUpload(target: Page | BrowserContext) {
  await target.route('**/uploads', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { image_url: '/uploads/e2e-fixture.jpg', thumbnail_url: '/uploads/e2e-fixture-thumb.jpg' },
      }),
    })
  })
}

// Drives the real registration/login ceremonies end-to-end using Chrome
// DevTools Protocol's WebAuthn virtual-authenticator support — the automated
// equivalent of a real Face ID prompt, standing in for hardware this CI
// runner doesn't have. Requires ROOT_INVITE_SECRET set to the same value the
// API under test is configured with. CDP is a Chromium-only capability —
// there is no WebKit or Firefox equivalent — so this can never run inside a
// WebKit context; see webkit-onboarding.spec.ts for how it works around that.
export async function addVirtualAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  })
}

// Feedback #88 replaced the old single-screen "Set up your profile" form
// with a stepped wizard (one field/group per screen, Continue between each)
// — this walks through it the same way a real member would, rather than
// filling every field on one page. IonInput's `label`/`labelPlacement`
// props (used throughout the wizard, unlike the old ion-item-wrapped
// IonInputs) give each field a real accessible label Playwright's
// getByLabel can resolve even through ion-input's closed shadow DOM — CDP-
// based tools like Playwright can reach into a closed shadow root for
// interaction even though a jsdom-based unit test cannot (see this
// codebase's other closed-shadow-DOM notes) — so there's no need for the
// old ion-item/hasText scoping workaround here.
export async function fillProfileAndContinue(
  page: Page,
  firstName: string,
  lastName: string,
  email: string,
  photoPath: string = FIXTURE_PHOTO_PATH,
) {
  await expect(page.getByRole('heading', { name: 'What should we call you?' })).toBeVisible({ timeout: 15000 })
  await page.getByLabel('First name').fill(firstName)
  await page.getByLabel('Last name').fill(lastName)
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: "What's your email?" })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByRole('button', { name: 'Continue' }).click()

  // Role became a required field 2026-08-05 (feedback #49) — now its own
  // step with big tappable cards (feedback #88 replaced the old IonModal
  // bottom-sheet RolePicker, which existed specifically to keep a role
  // explainer off a busy multi-field form page — a constraint that doesn't
  // apply once role has its own dedicated screen).
  // Each role option is one big tappable IonItem (heading + description +
  // an end-slotted radio with no accessible name of its own) rather than a
  // standalone labeled radio input — its accessible name is the whole card's
  // text content, so target the card itself by role="button", not the radio.
  await expect(page.getByRole('heading', { name: 'Which best describes you?' })).toBeVisible()
  await page.getByRole('button', { name: /Family/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Kids/grade became required for Family 2026-08-14 (feedback #81) — its
  // own step now too, pre-seeded with one kid at the default grade (the
  // "Kids at Nettelhorst" count picker never allows zero), so nothing
  // further is needed before continuing.
  await expect(page.getByRole('heading', { name: 'How many kids do you have at Nettelhorst?' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Photo became required 2026-08-14 (feedback #82) — still its own step,
  // unchanged in shape by feedback #88's redesign (Ben's own follow-up: "one
  // photo step should be enough" — CropModal already opens as a modal
  // overlay on this same step, not a separate one). Drive the real
  // CropModal crop UI (react-image-crop initializes a centered selection on
  // image load, so no drag interaction is needed, just waiting for it and
  // confirming) — this is the exact step that had a real WebKit-only bug
  // (see webkit-onboarding.spec.ts and CropModal.tsx's own comment), so the
  // wait/assert timing here is deliberately generous rather than tightened.
  await expect(page.getByRole('heading', { name: 'Add your photo' })).toBeVisible()
  await page.setInputFiles('input[type="file"]', photoPath)
  await expect(page.getByText('Crop photo')).toBeVisible({ timeout: 10000 })
  const usePhotoButton = page.getByRole('button', { name: 'Use Photo' })
  await expect(usePhotoButton).toBeEnabled({ timeout: 10000 })
  await usePhotoButton.click()
  await expect(page.getByText('Crop photo')).not.toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Last field step — Finish submits the real PATCH /auth/me.
  await expect(page.getByRole('heading', { name: 'Stay in the loop?' })).toBeVisible()
  await page.getByRole('button', { name: 'Finish' }).click()

  // Local "You're all set" completion screen (feedback #88) — not a route,
  // just this same component's own next internal phase; Continue here is
  // what actually advances past profile setup (refreshes auth state).
  await expect(page.getByRole('heading', { name: /You're all set/ })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Continue' }).click()

  // Choose-friends onboarding step (feedback #83) — new after profile setup,
  // before the real app renders. Picking anyone is optional; this e2e spec
  // only needs to get past it.
  await expect(page.getByRole('heading', { name: 'Find your friends' })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /Skip for now|Continue/ }).click()

  // Local "Welcome to Nettelhorst Bulbord" screen (feedback #88), same
  // deferred-refresh pattern as profile setup's own completion screen above
  // — "Start exploring" is what actually lands in the real app.
  await expect(page.getByRole('heading', { name: 'Welcome to Nettelhorst Bulbord' })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Start exploring' }).click()

  await page.waitForSelector('ion-tab-bar', { timeout: 15000 })
}
