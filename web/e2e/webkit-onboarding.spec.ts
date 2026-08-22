import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { chromium, devices, test, webkit, type Page } from '@playwright/test'

import { addVirtualAuthenticator, fillProfileAndContinue, mockPhotoUpload } from './helpers'

// Real WebKit (Safari's engine) coverage for the onboarding flow — added
// 2026-08-21 after a real, shipped bug: CropModal.tsx's photo-crop step
// permanently disabled Continue on Safari/iOS (reported as "no way to
// actually submit the picture"), a race in how WebKit reports a
// freshly-loaded <img>'s size that Chromium/jsdom testing never surfaced in
// this feature's whole life. Bulbord targets one viewport class — a phone —
// and for actual members, "phone" overwhelmingly means Safari on iOS, not
// Chromium. See CLAUDE.md's Testing section: a real-WebKit pass like this
// one is now standard for any UI/interaction-touching change, not just an
// emergency debugging technique reached for after a bug report.
//
// Doesn't run as its own Playwright *project* (unlike the 'mobile' Chromium
// project every other spec runs under) because Chrome DevTools Protocol's
// WebAuthn virtual-authenticator support — how every e2e spec in this repo
// fakes a Face ID prompt — is Chromium-only; there is no WebKit equivalent,
// and no CI runner has real biometric hardware. The workaround: register a
// real member in a genuine Chromium browser (launched directly here,
// independent of whichever project runs this file) far enough to get a real
// session token, then hand that token to a genuine WebKit browser to drive
// the rest of onboarding — the same token hand-off technique used to first
// find and verify the fix for this exact bug.
//
// Requires the WebKit browser + its Linux system libraries to actually be
// installed (`npx playwright install --with-deps webkit`, alongside the
// existing `chromium` install) — see .github/workflows/ci.yml's `e2e` job.

async function makeLargePhoneStylePhoto(page: Page): Promise<string> {
  // A real phone-camera-sized photo (much larger than its on-screen crop
  // box) — the exact shape that exposed the WebKit bug this spec guards: a
  // 3024x4032 photo, rendered far smaller on screen, corrupted the crop math
  // and permanently disabled Continue. The pre-existing small logo fixture
  // (see helpers.ts's FIXTURE_PHOTO_PATH) is too close to its own display
  // size to ever trigger this — natural and rendered size have to differ
  // meaningfully. Generated on the fly via a real <canvas> (same technique
  // CropModal.stories.tsx already uses) rather than checking in a large
  // binary fixture.
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 3024
    canvas.height = 4032
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#3b82f6'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath()
    ctx.arc(canvas.width / 2, canvas.height / 2, 900, 0, Math.PI * 2)
    ctx.fill()
    return canvas.toDataURL('image/jpeg', 0.8)
  })
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const dir = mkdtempSync(path.join(tmpdir(), 'bulbord-e2e-'))
  const filePath = path.join(dir, 'large-test-photo.jpg')
  writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return filePath
}

test('onboarding, including the photo-crop step, works on real WebKit', async ({ baseURL }) => {
  const rootSecret = process.env.ROOT_INVITE_SECRET
  test.skip(!rootSecret, 'ROOT_INVITE_SECRET must be set to run this spec')

  const chromiumBrowser = await chromium.launch()
  let token: string | null
  let photoPath: string
  try {
    const chromiumContext = await chromiumBrowser.newContext()
    const chromiumPage = await chromiumContext.newPage()
    await addVirtualAuthenticator(chromiumContext, chromiumPage)

    // Register just far enough to get a real session token for a genuinely
    // fresh, profile-incomplete member — none of the wizard's own fields are
    // filled here, since nothing about them persists until the real Finish
    // step (see ProfileSetupWizard.tsx's finish()), so there's nothing to
    // lose by handing off to WebKit at this exact point.
    await chromiumPage.goto(`${baseURL}/?rootSecret=${rootSecret}`)
    await chromiumPage.getByRole('button', { name: 'Continue' }).click()
    await chromiumPage.getByRole('heading', { name: 'What should we call you?' }).waitFor({ timeout: 15000 })
    token = await chromiumPage.evaluate(() => localStorage.getItem('bulbord_session_token'))

    photoPath = await makeLargePhoneStylePhoto(chromiumPage)
  } finally {
    await chromiumBrowser.close()
  }

  const webkitBrowser = await webkit.launch()
  try {
    const webkitContext = await webkitBrowser.newContext({ ...devices['iPhone 13'] })
    await webkitContext.addInitScript((t) => localStorage.setItem('bulbord_session_token', t as string), token)
    await mockPhotoUpload(webkitContext)

    const webkitPage = await webkitContext.newPage()
    await webkitPage.goto(baseURL!)

    await fillProfileAndContinue(webkitPage, 'Webkit', 'Tester', 'webkit-e2e@example.com', photoPath)
  } finally {
    await webkitBrowser.close()
  }
})
