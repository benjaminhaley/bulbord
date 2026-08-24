import { test, expect } from '@playwright/test'

import { addVirtualAuthenticator, fillProfileAndContinue, mockPhotoUpload } from './helpers'

// A tiny real 1x1 PNG, base64-encoded -- real image bytes so the paste
// event carries a genuine image/png clipboard item, not a fake MIME type.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function putImageOnClipboard(page: import('@playwright/test').Page) {
  await page.evaluate(async (base64) => {
    const byteChars = atob(base64)
    const bytes = new Uint8Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'image/png' })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  }, PNG_BASE64)
}

// Feedback #121 ("I paste a photo in feedback and don't see anything.
// works if I directly take a photo"): reproduced directly (not guessed at)
// by checking document.activeElement right after opening the "new post"
// composer -- it stayed the toolbar's own "+" toggle button, not the
// title field, despite that field's `autofocus` attribute. Root cause: the
// toggle button that reveals FeedbackForm stays mounted right next to it
// (a ternary/conditional render, not a full unmount of the trigger), and
// Chrome's native `autofocus` processing is a no-op whenever *anything* in
// the document already holds focus -- which the still-present toggle
// button does. A paste immediately after opening the form (the natural
// "tap + then Cmd+V" flow, without clicking into a field first) therefore
// never reached the form's onPaste handler at all. Fixed with a real
// imperative setFocus() call instead of relying on the attribute.
test('pasting an image works immediately after opening the feedback composer, with no prior click', async ({ page, context }) => {
  const rootSecret = process.env.ROOT_INVITE_SECRET
  test.skip(!rootSecret, 'ROOT_INVITE_SECRET must be set to run this spec')

  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await addVirtualAuthenticator(context, page)
  await mockPhotoUpload(context)

  await page.goto(`/?rootSecret=${rootSecret}`)
  await page.getByRole('button', { name: 'Continue' }).click()
  await fillProfileAndContinue(page, 'Paste', 'Tester', 'paste-focus-e2e@example.com')

  await page.goto('/feedback')
  await page.waitForSelector('ion-tab-bar')

  // Open the composer and paste *without* clicking into any field first --
  // this is exactly the sequence that silently did nothing before the fix.
  // The toolbar's "+" toggle button has no accessible name of its own (a
  // bare icon-only IonButton), so it's targeted structurally, same as the
  // manual reproduction that found this bug.
  // Scoped to the composer's own ion-list (identified by its "Title"
  // label) rather than any ion-list on the page -- the page can already
  // have other lists (backlog/in-progress accordion sections), and the
  // header avatar happens to share the same mocked e2e-fixture image URL
  // as an uploaded photo would, so an unscoped assertion would pass even
  // against the unfixed bug.
  const composer = page.locator('ion-list', { has: page.locator('ion-label', { hasText: 'Title' }) })
  await page.locator('ion-toolbar', { has: page.locator('ion-title', { hasText: 'Feedback' }) }).locator('ion-button').click()
  await expect(composer).toBeVisible()
  const thumbnailsBefore = await composer.locator('img').count()

  await putImageOnClipboard(page)
  await page.keyboard.press('Control+V')

  // POST /uploads is mocked (mockPhotoUpload), so this checks that a
  // thumbnail was actually attached inside the composer's own PhotoPicker
  // -- i.e. the paste was handled at all -- not any other e2e-fixture
  // image already on the page (the header avatar, etc, is the same mocked
  // URL, so asserting on that image existing anywhere would pass even
  // against the unfixed bug).
  await expect
    .poll(async () => composer.locator('img').count(), { timeout: 10000 })
    .toBeGreaterThan(thumbnailsBefore)
})
