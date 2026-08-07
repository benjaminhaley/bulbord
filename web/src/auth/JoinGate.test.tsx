import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByText('Sign In With Passkey')).toBeInTheDocument()
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

  it('renders the app once signed in with a completed profile', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'Ben Haley', profileComplete: true }, isLoading: false })
    renderGate('/events')
    expect(screen.getByText('the real app')).toBeInTheDocument()
  })

  it('keeps Continue disabled on the profile setup step until first name, last name, email, and role are all filled', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Nettelhorst member', profileComplete: false }, isLoading: false })
    const { container } = renderGate('/events')

    const button = screen.getByText('Continue').closest('ion-button') as unknown as { disabled: boolean }
    expect(button.disabled).toBe(true)

    const [firstNameInput, lastNameInput, emailInput] = container.querySelectorAll('ion-input')
    typeIntoIonInput(firstNameInput, 'Ben')
    typeIntoIonInput(lastNameInput, 'Haley')
    expect(button.disabled).toBe(true)

    typeIntoIonInput(emailInput, 'not-an-email')
    expect(button.disabled).toBe(true)

    typeIntoIonInput(emailInput, 'ben@example.com')
    expect(button.disabled).toBe(true)

    const roleGroup = roleRadioGroup()
    fireEvent(roleGroup, new CustomEvent('ionChange', { detail: { value: 'family' }, bubbles: true }))
    expect(button.disabled).toBe(false)
  })

  it('submits the entered email and role along with the name', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Nettelhorst member', profileComplete: false }, isLoading: false })
    const { container } = renderGate('/events')

    const [firstNameInput, lastNameInput, emailInput] = container.querySelectorAll('ion-input')
    typeIntoIonInput(firstNameInput, 'Ben')
    typeIntoIonInput(lastNameInput, 'Haley')
    typeIntoIonInput(emailInput, 'ben@example.com')

    const roleGroup = roleRadioGroup()
    fireEvent(roleGroup, new CustomEvent('ionChange', { detail: { value: 'family' }, bubbles: true }))

    fireEvent.click(screen.getByText('Continue').closest('ion-button')!)

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        name: 'Ben Haley',
        email: 'ben@example.com',
        avatarUrl: undefined,
        newsletterSubscribed: true,
        role: 'family',
        roleOther: undefined,
      })
    })
  })

  it('submits the free-text description when role is "other"', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Nettelhorst member', profileComplete: false }, isLoading: false })
    const { container } = renderGate('/events')

    const [firstNameInput, lastNameInput, emailInput] = container.querySelectorAll('ion-input')
    typeIntoIonInput(firstNameInput, 'Ben')
    typeIntoIonInput(lastNameInput, 'Haley')
    typeIntoIonInput(emailInput, 'ben@example.com')

    const roleGroup = roleRadioGroup()
    fireEvent(roleGroup, new CustomEvent('ionChange', { detail: { value: 'other' }, bubbles: true }))

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
        avatarUrl: undefined,
        newsletterSubscribed: true,
        role: 'other',
        roleOther: 'Neighbor',
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

    const roleGroup = roleRadioGroup()
    fireEvent(roleGroup, new CustomEvent('ionChange', { detail: { value: 'family' }, bubbles: true }))

    const checkbox = container.querySelector('ion-checkbox')!
    fireEvent(checkbox, new CustomEvent('ionChange', { detail: { checked: false }, bubbles: true }))

    fireEvent.click(screen.getByText('Continue').closest('ion-button')!)

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        name: 'Ben Haley',
        email: 'ben@example.com',
        avatarUrl: undefined,
        newsletterSubscribed: false,
        role: 'family',
        roleOther: undefined,
      })
    })
  })
})
