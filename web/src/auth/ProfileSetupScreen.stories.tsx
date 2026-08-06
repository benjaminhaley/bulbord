import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'

import { ProfileSetupScreen } from './JoinGate'

// The "set up your profile" step (feedback #44) — the one part of sign-up
// that previously had no way to preview at all (InvitePreviewPage only
// covered the invite page itself). Real component code, same as
// JoinGate.stories.tsx's InviteAcceptCard stories.
//
// Deliberately avoids Testing Library's role/label queries here: Ionic's
// IonLabel position="stacked" has no real <label for=...> association, ion-
// input uses closed shadow DOM (so its internal native <input> isn't
// reachable at all, even after hydration), and — found while writing these
// stories — a *disabled* ion-button's shadow content isn't exposed in the
// browser's computed accessibility tree, so `getByRole('button', ...)` never
// resolves for the initial disabled Continue button even with a long
// timeout. Plain DOM queries plus dispatching ion-input's own `ionInput`
// custom event directly — the same technique JoinGate.test.tsx already uses
// in jsdom (see its `typeIntoIonInput` helper) — sidesteps all of that.
const meta = {
  component: ProfileSetupScreen,
  tags: ['ai-generated'],
} satisfies Meta<typeof ProfileSetupScreen>

export default meta
type Story = StoryObj<typeof meta>

function setIonInputValue(el: Element, value: string) {
  el.dispatchEvent(new CustomEvent('ionInput', { detail: { value }, bubbles: true }))
}

function setIonSelectValue(el: Element, value: string) {
  el.dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true }))
}

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const continueButton = canvasElement.querySelector('ion-button')!
    await expect(continueButton).toHaveAttribute('disabled')
  },
}

export const FilledForm: Story = {
  play: async ({ canvasElement }) => {
    const [firstName, lastName, email] = canvasElement.querySelectorAll('ion-input')
    setIonInputValue(firstName, 'Ben')
    setIonInputValue(lastName, 'Haley')
    setIonInputValue(email, 'ben@example.com')
    setIonSelectValue(canvasElement.querySelector('ion-select')!, 'family')

    const continueButton = canvasElement.querySelector('ion-button')!
    await waitFor(() => expect(continueButton).not.toHaveAttribute('disabled'))
    continueButton.click()

    // Submits via the mocked PATCH /auth/me (.storybook/msw-handlers.ts) —
    // a real error message appearing here would mean the round trip failed.
    await waitFor(() => expect(canvasElement.textContent).not.toMatch(/could not save your profile/i))
  },
}

// The admin dev-tools walkthrough (ProfileSetupPreviewPage.tsx) renders this
// component with preview={true}. Every field must stay genuinely fillable
// and Continue must enable exactly like the real flow — the only thing
// `preview` should change is that Continue's click stops short of the real
// network call (see JoinGate.tsx's submit()). Regression coverage for
// feedback that an earlier version force-disabled most fields in preview.
export const PreviewMode: Story = {
  args: { preview: true },
  play: async ({ canvasElement }) => {
    const [firstName, lastName, email] = canvasElement.querySelectorAll('ion-input')
    await expect(firstName).not.toHaveAttribute('disabled')
    await expect(lastName).not.toHaveAttribute('disabled')
    await expect(email).not.toHaveAttribute('disabled')
    await expect(canvasElement.querySelector('ion-checkbox')).not.toHaveAttribute('disabled')

    setIonInputValue(firstName, 'Ben')
    setIonInputValue(lastName, 'Haley')
    setIonInputValue(email, 'ben@example.com')
    setIonSelectValue(canvasElement.querySelector('ion-select')!, 'family')

    const continueButton = canvasElement.querySelector('ion-button')!
    await waitFor(() => expect(continueButton).not.toHaveAttribute('disabled'))

    // Clicking must not throw or hit the real PATCH /auth/me — there's no
    // msw handler registered for it in this story, so an unmocked request
    // would surface as a network-error message here.
    continueButton.click()
    await expect(canvasElement.textContent).not.toMatch(/could not save your profile/i)
  },
}
