import { test, expect } from '@playwright/test'

import { addVirtualAuthenticator, fillProfileAndContinue, mockPhotoUpload } from './helpers'

test('open signup with admin approval: browse as a visitor, bootstrap, sign out/in, then a second person signs up and waits for approval', async ({
  page,
  context,
  baseURL,
}) => {
  const rootSecret = process.env.ROOT_INVITE_SECRET
  test.skip(!rootSecret, 'ROOT_INVITE_SECRET must be set to run this spec')

  await addVirtualAuthenticator(context, page)
  await mockPhotoUpload(context)

  await test.step('an anonymous visitor can browse, but protected tabs ask for a login', async () => {
    await page.goto('/')
    await page.waitForSelector('ion-tab-bar', { timeout: 15000 })
    await expect(page.getByText('Sign in', { exact: true })).toBeVisible()
    await page.locator('ion-tab-button[tab="feedback"]').click()
    // Sign-in is its own page with its own URL, and back returns to the tab
    // the visitor came from.
    await expect(page).toHaveURL(/\/login\?/)
    await expect(page.getByRole('heading', { name: 'Sign in to read and post feedback' })).toBeVisible()
    await expect(page.getByText('A bulletin board for the Nettelhorst community')).not.toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/events/)
  })

  await test.step('root registration via the bootstrap secret', async () => {
    await page.goto(`/?rootSecret=${rootSecret}`)
    await page.getByRole('button', { name: 'Create Account' }).click()
    await fillProfileAndContinue(page, 'Ben', 'Haley', 'ben-e2e@example.com')
  })

  const token = await page.evaluate(() => localStorage.getItem('bulbord_session_token'))
  const me = await page.evaluate(
    async (t) => (await fetch('http://localhost:3001/auth/me', { headers: { Authorization: `Bearer ${t}` } })).json(),
    token,
  )
  const rootUserId: string = me.data.id

  await test.step('signing out returns to browsing, and passkey sign-in still works', async () => {
    await page.evaluate(() => localStorage.removeItem('bulbord_session_token'))
    await page.goto('/feedback')
    await expect(page).toHaveURL(/\/login\?/)
    await expect(page.getByRole('heading', { name: 'Sign in to read and post feedback' })).toBeVisible()

    // De-emphasized to plain text (feedback #84) — no longer a real
    // ion-button, so it's found by its text/link role instead.
    await page.getByText('Sign In', { exact: true }).click()
    // Signed in — sent back to where they were headed (/feedback).
    await expect(page).toHaveURL(/\/feedback/, { timeout: 15000 })
  })

  await test.step('a second person signs up from a plain shared link and waits for approval', async () => {
    const guestContext = await page.context().browser()!.newContext()
    const guestPage = await guestContext.newPage()
    await addVirtualAuthenticator(guestContext, guestPage)
    await mockPhotoUpload(guestContext)

    // No ?invite= — a shared link is just a page now (feedback #175).
    await guestPage.goto(`${baseURL}/events`)
    await guestPage.getByText('Sign in', { exact: true }).click()
    await expect(guestPage).toHaveURL(/\/login/)
    await guestPage.getByRole('button', { name: 'Create Account' }).click()
    await fillProfileAndContinue(guestPage, 'Anna', 'Haley', 'anna-e2e@example.com', undefined, { pending: true })

    // Browsable, but not a member: banner says so, and a member-only tab
    // still asks instead of opening.
    await expect(guestPage.getByRole('heading', { name: "You're on the list" })).toBeVisible()
    await guestPage.getByRole('button', { name: 'Keep browsing' }).click()
    await expect(guestPage.getByText('Pending approval')).toBeVisible()
    await guestPage.locator('ion-tab-button[tab="feedback"]').click()
    await expect(guestPage.getByRole('heading', { name: "You're on the list" })).toBeVisible()

    const guestToken = await guestPage.evaluate(() => localStorage.getItem('bulbord_session_token'))
    const status = await guestPage.evaluate(async (t) => (await fetch('http://localhost:3001/feedback', { headers: { Authorization: `Bearer ${t}` } })).status, guestToken)
    expect(status).toBe(403)

    await guestContext.close()
  })
})
