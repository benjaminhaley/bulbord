import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { JoinGate } from './JoinGate'

const mockUseAuth = vi.fn()
const mockUpdateProfile = vi.fn().mockResolvedValue({})
vi.mock('./AuthContext', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('./api', () => ({
  fetchInviteInfo: vi.fn().mockResolvedValue({ name: 'Sam Rivera', avatarUrl: null }),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}))
// Real uploadImage would hit the network; a photo is now required to
// complete a profile (feedback #82), so every completion test needs one.
vi.mock('../uploads/api', () => ({
  uploadImage: vi.fn().mockResolvedValue({ image_url: '/uploads/profiles/test.jpg', thumbnail_url: '/uploads/profiles/test-thumb.jpg' }),
}))
// CropModal's real interactive crop UI (react-image-crop) isn't something
// this test drives — it's not unit-tested anywhere in this codebase (see
// uploads/CropModal.stories.tsx, no CropModal.test.tsx). Stubbed to call
// onCropped immediately once a file is picked, so the rest of the
// photo-required flow (attach -> uploadImage -> avatarUrl set) still runs.
vi.mock('../uploads/CropModal', () => ({
  CropModal: ({ file, onCropped }: { file: File | null; onCropped: (blob: Blob) => void }) => {
    useEffect(() => {
      if (file) onCropped(file)
    }, [file, onCropped])
    return null
  },
}))

// Ionic's React bindings attach a listener for the underlying Stencil web
// component's raw `ionInput` CustomEvent directly on the DOM node via ref,
// independent of whether the component has fully hydrated in jsdom — so
// dispatching that event directly is the reliable way to drive an IonInput
// in a test, the same way jsdom can't use fireEvent.change on a non-native
// <input>. Routed through RTL's generic `fireEvent(element, event)` form
// (not a raw `element.dispatchEvent`) so the resulting state update is
// wrapped in `act()` and committed before the next line reads the DOM.
function typeIntoIonInput(input: Element, value: string) {
  Object.defineProperty(input, 'value', { value, writable: true, configurable: true })
  fireEvent(input, new CustomEvent('ionInput', { detail: { value }, bubbles: true }))
}

// IonModal (RolePicker's role picker, see JoinGate.tsx) doesn't render its
// content as a light-DOM descendant of wherever it appears in JSX — the
// React wrapper portals it straight to `document.body` (or `ion-app` if one
// exists) via `createPortal`, leaving only an empty `<template>` marker at
// the JSX location. `keepContentsMounted` (set on that IonModal) keeps the
// radio group mounted even while closed, but it still only exists under
// `document.body`, never under RTL's `container` — so it has to be queried
// from there instead, unlike every other Ionic element in this file.
function roleRadioGroup() {
  return document.body.querySelector('ion-radio-group')!
}

function selectRole(role: string) {
  fireEvent(roleRadioGroup(), new CustomEvent('ionChange', { detail: { value: role }, bubbles: true }))
}

// Attaches a photo via the hidden file input — CropModal is mocked (above)
// to call onCropped once mounted, which drives the real
// attach -> mocked uploadImage -> avatarUrl-set chain. uploadImage's mock
// still resolves via a real microtask, so this waits for the resulting <img>
// to appear rather than assuming the state update already landed.
async function attachPhoto(container: HTMLElement) {
  const fileInput = container.querySelector('input[type="file"]')!
  const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
  fireEvent.change(fileInput, { target: { files: [file] } })
  await waitFor(() => expect(container.querySelector('img')).toBeInTheDocument())
}

function renderGate(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <JoinGate>
        <div>the real app</div>
      </JoinGate>
    </MemoryRouter>,
  )
}

describe('JoinGate', () => {
  it('shows a spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true })
    renderGate('/events')
    expect(screen.queryByText('the real app')).not.toBeInTheDocument()
  })

  it('shows a dead end with no invite/rootSecret param and no session', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false })
    renderGate('/events')
    expect(screen.getByText('You need an invitation to join Nettelhorst Bulbord')).toBeInTheDocument()
    expect(screen.queryByText('the real app')).not.toBeInTheDocument()
  })

  it('still offers a sign-in path even with no invite param, for a returning member', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false })
    renderGate('/events')
    expect(screen.getByText('Sign In')).toBeInTheDocument()
  })

  it('shows the inviter\'s name once the invite lookup resolves', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false })
    renderGate('/events?invite=user-42')
    expect(await screen.findByText('Sam Rivera invited you')).toBeInTheDocument()
  })

  it('shows the profile setup step for a signed-in user with no completed profile', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Nettelhorst member', profileComplete: false }, isLoading: false })
    renderGate('/events')
    expect(screen.getByText('Set up your profile')).toBeInTheDocument()
    expect(screen.queryByText('the real app')).not.toBeInTheDocument()
  })

  it('shows the choose-friends step for a signed-in user with a completed profile but no friends step', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Ben Haley', profileComplete: true, friendsStepComplete: false },
      isLoading: false,
    })
    renderGate('/events')
    expect(screen.getByText('Find your friends')).toBeInTheDocument()
    expect(screen.queryByText('the real app')).not.toBeInTheDocument()
  })

  it('renders the app once signed in with a completed profile and friends step', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Ben Haley', profileComplete: true, friendsStepComplete: true },
      isLoading: false,
    })
    renderGate('/events')
    expect(screen.getByText('the real app')).toBeInTheDocument()
  })

  it('keeps Continue disabled until name, email, photo, and role are all filled (Family pre-seeds its required kid automatically)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Nettelhorst member', profileComplete: false }, isLoading: false })
    const { container } = renderGate('/events')

    const button = screen.getByText('Continue').closest('ion-button') as unknown as { disabled: boolean }
    expect(button.disabled).toBe(true)

    const [firstNameInput, lastNameInput, emailInput] = container.querySelectorAll('ion-input')
    typeIntoIonInput(firstNameInput, 'Ben')
    typeIntoIonInput(lastNameInput, 'Haley')
    typeIntoIonInput(emailInput, 'ben@example.com')
    expect(button.disabled).toBe(true)

    // Selecting Family pre-seeds one kid at the default grade (feedback,
    // 2026-08-14: "pre-selected to one, don't allow a zero selection") — no
    // separate "add a kid" step needed, so only the photo is still missing.
    selectRole('family')
    expect(button.disabled).toBe(true)

    await attachPhoto(container)
    expect(button.disabled).toBe(false)
  })

  it('shows the required-fields explanation under Continue while it is disabled, and hides it once complete', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Nettelhorst member', profileComplete: false }, isLoading: false })
    const { container } = renderGate('/events')

    expect(
      screen.getByText(
        'Nettelhorst Bulbord is only for members of the Nettelhorst community — this information lets others verify that you are.',
      ),
    ).toBeInTheDocument()

    const [firstNameInput, lastNameInput, emailInput] = container.querySelectorAll('ion-input')
    typeIntoIonInput(firstNameInput, 'Ben')
    typeIntoIonInput(lastNameInput, 'Haley')
    typeIntoIonInput(emailInput, 'ben@example.com')
    selectRole('staff')
    await attachPhoto(container)

    expect(
      screen.queryByText(
        'Nettelhorst Bulbord is only for members of the Nettelhorst community — this information lets others verify that you are.',
      ),
    ).not.toBeInTheDocument()
  })

  it('submits the entered email, role, photo, and kids along with the name', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Nettelhorst member', profileComplete: false }, isLoading: false })
    const { container } = renderGate('/events')

    const [firstNameInput, lastNameInput, emailInput] = container.querySelectorAll('ion-input')
    typeIntoIonInput(firstNameInput, 'Ben')
    typeIntoIonInput(lastNameInput, 'Haley')
    typeIntoIonInput(emailInput, 'ben@example.com')
    selectRole('family')
    await attachPhoto(container)

    fireEvent.click(screen.getByText('Continue').closest('ion-button')!)

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
  })

  it('submits the free-text description when role is "other", with no kids', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Nettelhorst member', profileComplete: false }, isLoading: false })
    const { container } = renderGate('/events')

    const [firstNameInput, lastNameInput, emailInput] = container.querySelectorAll('ion-input')
    typeIntoIonInput(firstNameInput, 'Ben')
    typeIntoIonInput(lastNameInput, 'Haley')
    typeIntoIonInput(emailInput, 'ben@example.com')
    selectRole('other')
    await attachPhoto(container)

    const button = screen.getByText('Continue').closest('ion-button') as unknown as { disabled: boolean }
    expect(button.disabled).toBe(true)

    const roleOtherInput = container.querySelectorAll('ion-input')[3]
    typeIntoIonInput(roleOtherInput, 'Neighbor')
    expect(button.disabled).toBe(false)

    fireEvent.click(screen.getByText('Continue').closest('ion-button')!)

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        name: 'Ben Haley',
        email: 'ben@example.com',
        avatarUrl: '/uploads/profiles/test.jpg',
        newsletterSubscribed: true,
        role: 'other',
        roleOther: 'Neighbor',
        kids: undefined,
      })
    })
  })

  it('submits newsletterSubscribed: false when the checkbox is unchecked', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Nettelhorst member', profileComplete: false }, isLoading: false })
    const { container } = renderGate('/events')

    const [firstNameInput, lastNameInput, emailInput] = container.querySelectorAll('ion-input')
    typeIntoIonInput(firstNameInput, 'Ben')
    typeIntoIonInput(lastNameInput, 'Haley')
    typeIntoIonInput(emailInput, 'ben@example.com')
    selectRole('family')
    await attachPhoto(container)

    const checkbox = container.querySelector('ion-checkbox')!
    fireEvent(checkbox, new CustomEvent('ionChange', { detail: { checked: false }, bubbles: true }))

    fireEvent.click(screen.getByText('Continue').closest('ion-button')!)

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        name: 'Ben Haley',
        email: 'ben@example.com',
        avatarUrl: '/uploads/profiles/test.jpg',
        newsletterSubscribed: false,
        role: 'family',
        roleOther: undefined,
        kids: [{ grade: 'pre-k' }],
      })
    })
  })
})
