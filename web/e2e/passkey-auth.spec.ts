import { fileURLToPath } from 'node:url'

import { test, expect, type Page, type BrowserContext } from '@playwright/test'

// Reused as the fixture photo for the now-required profile-photo step
// (feedback #82) — any real, decodable image works; this one's already in
// the repo, so no new test fixture is needed.
const FIXTURE_PHOTO_PATH = fileURLToPath(new URL('../public/nettelhorst-logo.png', import.meta.url))

// CI's UPLOADS_* env vars are deliberately non-functional (see
// .github/workflows/ci.yml — UPLOADS_ENDPOINT: http://localhost:0) since no
// e2e spec ever needed a real upload to succeed before the photo step
// became required (feedback #82). Rather than wiring real object-storage
// credentials into CI just for this, POST /uploads is mocked at the network
// level — the same approach Playwright itself recommends for a dependency
// this test doesn't actually need to exercise for real.
async function mockPhotoUpload(target: Page | BrowserContext) {
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
// API under test is configured with.

async function addVirtualAuthenticator(context: BrowserContext, page: Page) {
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
async function fillProfileAndContinue(page: Page, firstName: string, lastName: string, email: string) {
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
  // confirming).
  await expect(page.getByRole('heading', { name: 'Add your photo' })).toBeVisible()
  await page.setInputFiles('input[type="file"]', FIXTURE_PHOTO_PATH)
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

test('the whole invite-only passkey flow: bootstrap, sign out/in, then a second person redeeming an invite', async ({
  page,
  context,
  baseURL,
}) => {
  const rootSecret = process.env.ROOT_INVITE_SECRET
  test.skip(!rootSecret, 'ROOT_INVITE_SECRET must be set to run this spec')

  await addVirtualAuthenticator(context, page)
  await mockPhotoUpload(context)

  await test.step('an uninvited visitor is fully gated out', async () => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'You need an invitation to join Nettelhorst Bulbord' })).toBeVisible()
  })

  await test.step('root registration via the bootstrap secret', async () => {
    await page.goto(`/?rootSecret=${rootSecret}`)
    await page.getByRole('button', { name: 'Continue' }).click()
    await fillProfileAndContinue(page, 'Ben', 'Haley', 'ben-e2e@example.com')
  })

  const token = await page.evaluate(() => localStorage.getItem('bulbord_session_token'))
  const me = await page.evaluate(
    async (t) => (await fetch('http://localhost:3001/auth/me', { headers: { Authorization: `Bearer ${t}` } })).json(),
    token,
  )
  const rootUserId: string = me.data.id

  await test.step('signing out gates the app again, but sign-in still works', async () => {
    await page.evaluate(() => localStorage.removeItem('bulbord_session_token'))
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'You need an invitation to join Nettelhorst Bulbord' })).toBeVisible()

    // De-emphasized to plain text (feedback #84) — no longer a real
    // ion-button, so it's found by its text/link role instead.
    await page.getByText('Sign In', { exact: true }).click()
    await page.waitForSelector('ion-tab-bar', { timeout: 15000 })
  })

  await test.step('a second person redeems an invite link and sees who invited them', async () => {
    const guestContext = await page.context().browser()!.newContext()
    const guestPage = await guestContext.newPage()
    await addVirtualAuthenticator(guestContext, guestPage)
    await mockPhotoUpload(guestContext)

    await guestPage.goto(`${baseURL}/events?invite=${rootUserId}`)
    await expect(guestPage.getByRole('heading', { name: 'Ben Haley invited you' })).toBeVisible({
      timeout: 10000,
    })
    await guestPage.getByRole('button', { name: 'Accept Invite' }).click()
    await fillProfileAndContinue(guestPage, 'Anna', 'Haley', 'anna-e2e@example.com')

    await guestContext.close()
  })
})
