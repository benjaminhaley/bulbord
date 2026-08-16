import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'

import { ProfileSetupWizard } from './ProfileSetupWizard'

// The stepped sign-up flow (feedback #88) that replaced ProfileSetupScreen's
// one long scrolling form for first-time onboarding — ProfileSetupScreen
// itself keeps its own story file (still used by EditProfilePage.tsx for
// editing an existing profile). Real component code, same rationale as every
// other story file in this codebase.
//
// Same DOM-query techniques ProfileSetupScreen.stories.tsx already
// established (dispatching ion-input's own `ionInput` event, walking up
// from visible text to the real ion-button rather than role/label queries)
// — see that file's own comment for why role/label queries don't work
// reliably against Ionic's web components here.
const meta = {
  component: ProfileSetupWizard,
  tags: ['ai-generated'],
} satisfies Meta<typeof ProfileSetupWizard>

export default meta
type Story = StoryObj<typeof meta>

function setIonInputValue(el: Element, value: string) {
  el.dispatchEvent(new CustomEvent('ionInput', { detail: { value }, bubbles: true }))
}

function continueButton(canvasElement: HTMLElement) {
  return Array.from(canvasElement.querySelectorAll('ion-button')).find((b) => /Continue|Finish/.test(b.textContent ?? ''))!
}

export const NameStep: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('h2')).toHaveTextContent('What should we call you?')
    await expect(continueButton(canvasElement)).toHaveAttribute('disabled')
  },
}

// Steps through Name -> Email -> Role to land on the Photo step, and
// confirms Continue is disabled there without a photo — the same "every
// other requirement gates correctly" check ProfileSetupScreen.stories.tsx's
// FilledForm story does, for the same reason (real react-image-crop UI
// needs a real decodable image a story can't reliably provide; the full
// photo -> avatarUrl -> submit path is covered by
// ProfileSetupWizard.test.tsx, which mocks CropModal).
export const StepsThroughToPhoto: Story = {
  play: async ({ canvasElement }) => {
    const [firstName, lastName] = canvasElement.querySelectorAll('ion-input')
    setIonInputValue(firstName, 'Ben')
    setIonInputValue(lastName, 'Haley')
    await waitFor(() => expect(continueButton(canvasElement)).not.toHaveAttribute('disabled'))
    continueButton(canvasElement).click()

    await waitFor(() => expect(canvasElement.querySelector('h2')).toHaveTextContent("What's your email?"))
    const email = canvasElement.querySelector('ion-input')!
    setIonInputValue(email, 'ben@example.com')
    await waitFor(() => expect(continueButton(canvasElement)).not.toHaveAttribute('disabled'))
    continueButton(canvasElement).click()

    await waitFor(() => expect(canvasElement.querySelector('ion-radio-group')).toBeTruthy())
    const radioGroup = canvasElement.querySelector('ion-radio-group')!
    radioGroup.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'staff' }, bubbles: true }))
    await waitFor(() => expect(continueButton(canvasElement)).not.toHaveAttribute('disabled'))
    continueButton(canvasElement).click()

    await waitFor(() => expect(canvasElement.querySelector('h2')).toHaveTextContent('Add your photo'))
    await expect(continueButton(canvasElement)).toHaveAttribute('disabled')
  },
}

// The admin dev-tools walkthrough (ProfileSetupPreviewPage.tsx) renders this
// component with preview={true}. Every field/step must stay genuinely
// usable — regression coverage mirroring ProfileSetupScreen.stories.tsx's
// own PreviewMode story for the same feedback (preview shouldn't force-
// disable fields).
export const PreviewMode: Story = {
  args: { preview: true },
  play: async ({ canvasElement }) => {
    const [firstName, lastName] = canvasElement.querySelectorAll('ion-input')
    await expect(firstName).not.toHaveAttribute('disabled')
    await expect(lastName).not.toHaveAttribute('disabled')
    setIonInputValue(firstName, 'Ben')
    setIonInputValue(lastName, 'Haley')
    await waitFor(() => expect(continueButton(canvasElement)).not.toHaveAttribute('disabled'))
  },
}
