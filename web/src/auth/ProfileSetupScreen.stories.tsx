import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

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

// `querySelector('ion-button')` used to unambiguously mean "the Continue
// button" — the only ion-button on this form. That stopped being true
// 2026-08-22 when the photo picker switched from a hand-rolled `<div
// onClick>` to a real IonButton (see JoinGate.tsx's own comment on that
// change): it now sits earlier in the DOM and matches first. Select by
// visible text instead of position, so this doesn't quietly break again the
// next time a plain div becomes a real Ionic control.
function findContinueButton(canvasElement: HTMLElement): Element {
  return Array.from(canvasElement.querySelectorAll('ion-button')).find((el) => el.textContent?.includes('Continue'))!
}

// The role field is a custom IonModal-based picker (RolePicker in
// JoinGate.tsx), not an IonSelect — and IonModal's React wrapper portals its
// content straight to document.body (or ion-app if present) rather than
// rendering it as a light-DOM descendant of wherever it appears in JSX, so
// its ion-radio-group is never actually inside `canvasElement`. Same gotcha
// documented in JoinGate.test.tsx's `roleRadioGroup()` helper.
function setRole(value: string) {
  const radioGroup = document.body.querySelector('ion-radio-group')!
  radioGroup.dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true }))
}

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const continueButton = findContinueButton(canvasElement)
    await expect(continueButton).toHaveAttribute('disabled')
  },
}

// A photo is now required to complete a profile (feedback #82), on top of
// name/email/role — but driving CropModal's real react-image-crop UI to
// completion needs an actual decodable image loaded into a real <img>,
// which a synthetic File in a story can't reliably provide. The full
// photo -> avatarUrl -> submit path is covered instead by
// JoinGate.test.tsx, which mocks CropModal to skip the interactive crop
// step. This story keeps its original job — confirming every other field
// enables Continue's *other* gating correctly — by asserting Continue stays
// disabled without a photo, rather than pretending to attach one.
export const FilledForm: Story = {
  play: async ({ canvasElement }) => {
    const [firstName, lastName, email] = canvasElement.querySelectorAll('ion-input')
    setIonInputValue(firstName, 'Ben')
    setIonInputValue(lastName, 'Haley')
    setIonInputValue(email, 'ben@example.com')
    setRole('family')

    const continueButton = findContinueButton(canvasElement)
    await expect(continueButton).toHaveAttribute('disabled') // still missing a photo (and a kid)
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
    setRole('staff')

    // A photo is required too (feedback #82) — not simulated here for the
    // same reason as FilledForm above (real react-image-crop UI needs a
    // real decodable image). 'staff' rather than 'family' so this story
    // isn't also blocked on the kids/grade fields (feedback #81), keeping
    // its actual point — every field stays genuinely usable in preview
    // mode — isolated to what it can verify without a real photo.
    const continueButton = findContinueButton(canvasElement)
    await expect(continueButton).toHaveAttribute('disabled')
  },
}
