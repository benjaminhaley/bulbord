import { test, expect } from '@playwright/test'

import { addVirtualAuthenticator, fillProfileAndContinue, mockPhotoUpload } from './helpers'

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
