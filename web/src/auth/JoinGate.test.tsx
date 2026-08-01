import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { JoinGate } from './JoinGate'

const mockUseAuth = vi.fn()
vi.mock('./AuthContext', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('./api', () => ({ fetchInviteInfo: vi.fn().mockResolvedValue({ name: 'Sam Rivera', avatarUrl: null }) }))

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
})
