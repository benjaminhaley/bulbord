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
    expect(screen.getByText('You need an invitation to join Campy')).toBeInTheDocument()
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
    expect(await screen.findByText('Sam Rivera invited you to Campy')).toBeInTheDocument()
  })

  it('shows the profile setup step for a signed-in user with no completed profile', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Campy member', profileComplete: false }, isLoading: false })
    renderGate('/events')
    expect(screen.getByText('Set up your profile')).toBeInTheDocument()
    expect(screen.queryByText('the real app')).not.toBeInTheDocument()
  })

  it('renders the app once signed in with a completed profile', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'Ben Haley', profileComplete: true }, isLoading: false })
    renderGate('/events')
    expect(screen.getByText('the real app')).toBeInTheDocument()
  })

  it('keeps Continue disabled on the profile setup step until first name, last name, and a valid email are all filled', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Campy member', profileComplete: false }, isLoading: false })
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
    expect(button.disabled).toBe(false)
  })

  it('submits the entered email along with the name', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Campy member', profileComplete: false }, isLoading: false })
    const { container } = renderGate('/events')

    const [firstNameInput, lastNameInput, emailInput] = container.querySelectorAll('ion-input')
    typeIntoIonInput(firstNameInput, 'Ben')
    typeIntoIonInput(lastNameInput, 'Haley')
    typeIntoIonInput(emailInput, 'ben@example.com')

    fireEvent.click(screen.getByText('Continue').closest('ion-button')!)

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ name: 'Ben Haley', email: 'ben@example.com', avatarUrl: undefined })
    })
  })
})
