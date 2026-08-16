import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfileSetupWizard } from './ProfileSetupWizard'

const mockRefresh = vi.fn().mockResolvedValue(undefined)
const mockUpdateProfile = vi.fn().mockResolvedValue({})
vi.mock('./AuthContext', () => ({ useAuth: () => ({ refresh: mockRefresh }) }))
vi.mock('./api', () => ({
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}))
// A photo is required to finish (feedback #82) — mocked the same way as
// JoinGate.test.tsx so the rest of the photo-required flow (attach ->
// uploadImage -> avatarUrl set) still runs for real.
vi.mock('../uploads/api', () => ({
  uploadImage: vi.fn().mockResolvedValue({ image_url: '/uploads/profiles/test.jpg', thumbnail_url: '/uploads/profiles/test-thumb.jpg' }),
}))
vi.mock('../uploads/CropModal', () => ({
  CropModal: ({ file, onCropped }: { file: File | null; onCropped: (blob: Blob) => void }) => {
    useEffect(() => {
      if (file) onCropped(file)
    }, [file, onCropped])
    return null
  },
}))

// Same technique JoinGate.test.tsx already established for driving an
// IonInput in jsdom — see that file's own comment for why.
function typeIntoIonInput(input: Element, value: string) {
  Object.defineProperty(input, 'value', { value, writable: true, configurable: true })
  fireEvent(input, new CustomEvent('ionInput', { detail: { value }, bubbles: true }))
}

// A *disabled* ion-button's shadow content isn't exposed in jsdom's (or even
// a real browser's) accessibility tree at all, so getByRole('button', ...)
// never resolves for it — the same gotcha CLAUDE.md's Testing section and
// JoinGate.test.tsx's own helpers already document. Query by visible text
// and walk up to the real custom element instead.
function continueOrFinishButton() {
  const el = screen.queryByText('Continue')?.closest('ion-button') ?? screen.getByText('Finish').closest('ion-button')
  return el as unknown as { disabled: boolean } & Element
}

function clickContinue() {
  fireEvent.click(continueOrFinishButton())
}

async function fillName(container: HTMLElement) {
  const [first, last] = container.querySelectorAll('ion-input')
  typeIntoIonInput(first, 'Ben')
  typeIntoIonInput(last, 'Haley')
  clickContinue()
}

async function fillEmail(container: HTMLElement, email = 'ben@example.com') {
  const input = container.querySelector('ion-input')!
  typeIntoIonInput(input, email)
  clickContinue()
}

// The role step's cards are a plain inline ion-radio-group now (not a modal
// bottom sheet like the single-page ProfileSetupScreen's RolePicker), so —
// unlike JoinGate.test.tsx's roleRadioGroup() helper — this is queryable
// directly from the render container.
function selectRole(container: HTMLElement, role: string) {
  fireEvent(container.querySelector('ion-radio-group')!, new CustomEvent('ionChange', { detail: { value: role }, bubbles: true }))
}

async function attachPhoto(container: HTMLElement) {
  const fileInput = container.querySelector('input[type="file"]')!
  const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
  fireEvent.change(fileInput, { target: { files: [file] } })
  await waitFor(() => expect(container.querySelector('img')).toBeInTheDocument())
}

describe('ProfileSetupWizard', () => {
  beforeEach(() => {
    mockRefresh.mockClear()
    mockUpdateProfile.mockClear()
  })

  it('shows the name step first, with Continue disabled until both fields are filled', () => {
    const { container } = render(<ProfileSetupWizard />)
    expect(screen.getByText('What should we call you?')).toBeInTheDocument()
    expect(continueOrFinishButton().disabled).toBe(true)

    const [first, last] = container.querySelectorAll('ion-input')
    typeIntoIonInput(first, 'Ben')
    expect(continueOrFinishButton().disabled).toBe(true)
    typeIntoIonInput(last, 'Haley')
    expect(continueOrFinishButton().disabled).toBe(false)
  })

  it('moves forward and back between steps, preserving entered values', async () => {
    const { container } = render(<ProfileSetupWizard />)
    await fillName(container)
    expect(await screen.findByText("What's your email?")).toBeInTheDocument()

    fireEvent.click(container.querySelector('[data-testid="wizard-back"]')!)
    expect(await screen.findByText('What should we call you?')).toBeInTheDocument()
    const [first, last] = container.querySelectorAll('ion-input')
    expect((first as unknown as { value: string }).value).toBe('Ben')
    expect((last as unknown as { value: string }).value).toBe('Haley')
  })

  it('has no Back button on the first step', () => {
    const { container } = render(<ProfileSetupWizard />)
    const back = container.querySelector('[data-testid="wizard-back"]') as unknown as { disabled: boolean }
    expect(back.disabled).toBe(true)
  })

  it('only inserts a Kids step for the Family role, and skips it otherwise', async () => {
    const { container } = render(<ProfileSetupWizard />)
    await fillName(container)
    await fillEmail(container)
    expect(await screen.findByText('Which best describes you?')).toBeInTheDocument()

    selectRole(container, 'staff')
    clickContinue()
    expect(await screen.findByText('Add your photo')).toBeInTheDocument()
  })

  it('shows the Kids step for Family, pre-seeded with one kid, and requires a description for Other', async () => {
    const { container } = render(<ProfileSetupWizard />)
    await fillName(container)
    await fillEmail(container)
    await screen.findByText('Which best describes you?')

    selectRole(container, 'family')
    clickContinue()
    expect(await screen.findByText('How many kids do you have at Nettelhorst?')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument() // pre-seeded, never zero

    fireEvent.click(container.querySelector('[data-testid="wizard-back"]')!)
    await screen.findByText('Which best describes you?')
    selectRole(container, 'other')
    expect(continueOrFinishButton().disabled).toBe(true)
    const roleOtherInput = container.querySelector('ion-input')!
    typeIntoIonInput(roleOtherInput, 'Neighbor')
    expect(continueOrFinishButton().disabled).toBe(false)
  })

  it('the kid-count stepper stays within 1-5', async () => {
    const { container } = render(<ProfileSetupWizard />)
    await fillName(container)
    await fillEmail(container)
    await screen.findByText('Which best describes you?')
    selectRole(container, 'family')
    clickContinue()
    await screen.findByText('How many kids do you have at Nettelhorst?')

    const minus = container.querySelector('[data-testid="kid-count-minus"]') as unknown as { disabled: boolean }
    expect(minus.disabled).toBe(true) // already at 1

    const plus = container.querySelector('[data-testid="kid-count-plus"]')!
    for (let i = 0; i < 4; i++) fireEvent.click(plus)
    expect(screen.getByText('5')).toBeInTheDocument()
    const plusAfter = container.querySelector('[data-testid="kid-count-plus"]') as unknown as { disabled: boolean }
    expect(plusAfter.disabled).toBe(true) // capped at 5
    expect(container.querySelectorAll('ion-select')).toHaveLength(5)
  })

  it('shows the required-photo explanation while Continue is disabled, and hides it once attached', async () => {
    const { container } = render(<ProfileSetupWizard />)
    await fillName(container)
    await fillEmail(container)
    await screen.findByText('Which best describes you?')
    selectRole(container, 'staff')
    clickContinue()
    await screen.findByText('Add your photo')

    expect(
      screen.getByText(
        'Nettelhorst Bulbord is only for members of the Nettelhorst community — this information lets others verify that you are.',
      ),
    ).toBeInTheDocument()

    await attachPhoto(container)

    expect(
      screen.queryByText(
        'Nettelhorst Bulbord is only for members of the Nettelhorst community — this information lets others verify that you are.',
      ),
    ).not.toBeInTheDocument()
    expect(continueOrFinishButton().disabled).toBe(false)
  })

  it('submits the entered fields and shows the completion screen, and Continue there advances onward', async () => {
    const onSaved = vi.fn()
    const { container } = render(<ProfileSetupWizard onSaved={onSaved} />)
    await fillName(container)
    await fillEmail(container)
    await screen.findByText('Which best describes you?')
    selectRole(container, 'family')
    clickContinue()
    await screen.findByText('How many kids do you have at Nettelhorst?')
    clickContinue()
    await screen.findByText('Add your photo')
    await attachPhoto(container)
    clickContinue()
    await screen.findByText('Stay in the loop?')

    clickContinue() // "Finish"

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        name: 'Ben Haley',
        email: 'ben@example.com',
        avatarUrl: '/uploads/profiles/test.jpg',
        newsletterSubscribed: true,
        role: 'family',
        roleOther: undefined,
        kids: [{ grade: 'pre-k' }],
      })
    })

    expect(await screen.findByText("You're all set, Ben!")).toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Continue').closest('ion-button')!)
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(onSaved).toHaveBeenCalled()
  })

  it('submits newsletterSubscribed: false when the toggle is switched off', async () => {
    const { container } = render(<ProfileSetupWizard />)
    await fillName(container)
    await fillEmail(container)
    await screen.findByText('Which best describes you?')
    selectRole(container, 'staff')
    clickContinue()
    await screen.findByText('Add your photo')
    await attachPhoto(container)
    clickContinue()
    await screen.findByText('Stay in the loop?')

    const toggle = container.querySelector('ion-toggle')!
    fireEvent(toggle, new CustomEvent('ionChange', { detail: { checked: false }, bubbles: true }))
    clickContinue()

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ newsletterSubscribed: false }))
    })
  })

  it('preview mode never calls the real network request, but still shows the completion screen', async () => {
    const { container } = render(<ProfileSetupWizard preview />)
    await fillName(container)
    await fillEmail(container)
    await screen.findByText('Which best describes you?')
    selectRole(container, 'staff')
    clickContinue()
    await screen.findByText('Add your photo')
    await attachPhoto(container)
    clickContinue()
    await screen.findByText('Stay in the loop?')
    clickContinue()

    expect(await screen.findByText("You're all set, Ben!")).toBeInTheDocument()
    expect(mockUpdateProfile).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Continue').closest('ion-button')!)
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
