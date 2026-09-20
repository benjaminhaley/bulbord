import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { JoinGate } from './JoinGate'
import { getToken } from './token'

const mockUseAuth = vi.fn()
vi.mock('./AuthContext', () => ({ useAuth: () => mockUseAuth() }))

// JoinGate's own job is picking the right top-level screen for a given auth
// state (spinner / invite / profile setup / choose friends / the real app) —
// deep field-by-field coverage of the profile-setup step itself now lives in
// ProfileSetupWizard.test.tsx (feedback #88 replaced the old single-screen
// ProfileSetupScreen, previously tested in depth right here, with a stepped
// wizard component that has its own dedicated test file, the same way
// ChooseFriendsScreen already has its own tests rather than being covered
// only through JoinGate).
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

  // Feedback #175: the app is browsable without an account — the gate no
  // longer blocks a logged-out visitor, and the sign-in card lives behind the
  // protected actions instead (see LoginPrompt.test.tsx).
  it('renders the app for an anonymous visitor instead of blocking it', () => {
    mockUseAuth.mockReturnValue({ user: null, pendingUser: null, isLoading: false })
    renderGate('/events')
    expect(screen.getByText('the real app')).toBeInTheDocument()
  })

  it('does not treat a stale ?invite= param as a gate — the shared page just opens', () => {
    mockUseAuth.mockReturnValue({ user: null, pendingUser: null, isLoading: false })
    renderGate('/events/abc?invite=user-42')
    expect(screen.getByText('the real app')).toBeInTheDocument()
  })

  it('renders the app for a pending (unapproved) account with a completed profile', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      pendingUser: { id: 'u9', name: 'Pat', profileComplete: true, friendsStepComplete: false, approved: false },
      isLoading: false,
    })
    renderGate('/events')
    expect(screen.getByText('the real app')).toBeInTheDocument()
  })

  it('finishes profile setup for a pending account before showing the app', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      pendingUser: { id: 'u9', name: 'New Nettelhorst member', profileComplete: false, approved: false },
      isLoading: false,
    })
    renderGate('/events')
    expect(screen.getByText('What should we call you?')).toBeInTheDocument()
    expect(screen.queryByText('the real app')).not.toBeInTheDocument()
  })

  it('a root-secret bootstrap link shows the create-account card even though the app is open', () => {
    mockUseAuth.mockReturnValue({ user: null, pendingUser: null, isLoading: false })
    renderGate('/events?rootSecret=shh')
    expect(screen.getByText('Join Nettelhorst Bulbord')).toBeInTheDocument()
    expect(screen.queryByText('the real app')).not.toBeInTheDocument()
  })

  // The manual "have a sign-in link instead?" fallback (added after Apple
  // rejected build 14 for opening the sign-in link in Safari instead of the
  // app — see CLAUDE.md's Platform strategy) doesn't depend on Universal
  // Link hand-off at all: typing/pasting the link directly into this field
  // never leaves the running app.
  it('lets a pasted sign-in link store its token and trigger a refresh', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({ user: null, pendingUser: null, isLoading: false, refresh })
    const { container } = renderGate('/events?rootSecret=shh')

    fireEvent.click(screen.getByText('Have a sign-in link instead?'))
    const input = container.querySelector('ion-input')!
    fireEvent(
      input,
      new CustomEvent('ionInput', {
        detail: { value: 'https://nettelhorst.bulbord.com/?signInToken=test-token-123' },
        bubbles: true,
      }),
    )
    fireEvent.click(screen.getByText('Continue').closest('ion-button')!)

    expect(getToken()).toBe('test-token-123')
    expect(refresh).toHaveBeenCalled()
  })

  it('shows the profile setup wizard for a signed-in user with no completed profile', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'New Nettelhorst member', profileComplete: false }, isLoading: false })
    renderGate('/events')
    expect(screen.getByText('What should we call you?')).toBeInTheDocument()
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
})
