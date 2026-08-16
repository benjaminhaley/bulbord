import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { JoinGate } from './JoinGate'

const mockUseAuth = vi.fn()
vi.mock('./AuthContext', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('./api', () => ({
  fetchInviteInfo: vi.fn().mockResolvedValue({ name: 'Sam Rivera', avatarUrl: null }),
}))

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
