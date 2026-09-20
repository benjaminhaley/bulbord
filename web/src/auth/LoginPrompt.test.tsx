import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { requiresLogin } from './LoginPrompt'

const mockUseAuth = vi.fn()
vi.mock('./AuthContext', () => ({ useAuth: () => mockUseAuth() }))

function Secret() {
  return <div>members only content</div>
}

// Feedback #175: a whole page that only makes sense signed in (Feedback,
// Friends, Account...) stays reachable from its tab/link, and shows the
// sign-in card in place of the page for anyone who isn't a member yet.
describe('requiresLogin', () => {
  const Gated = requiresLogin(Secret, 'Sign in to read and post feedback')

  it('shows the sign-in card, not the page, to an anonymous visitor', () => {
    mockUseAuth.mockReturnValue({ user: null, pendingUser: null, refresh: vi.fn() })
    render(
      <MemoryRouter>
        <Gated />
      </MemoryRouter>,
    )
    expect(screen.getByText('Sign in to read and post feedback')).toBeInTheDocument()
    expect(screen.queryByText('members only content')).not.toBeInTheDocument()
  })

  it('tells a pending account its approval is outstanding', () => {
    mockUseAuth.mockReturnValue({ user: null, pendingUser: { id: 'u9' }, logout: vi.fn() })
    render(
      <MemoryRouter>
        <Gated />
      </MemoryRouter>,
    )
    expect(screen.getByText("You're on the list")).toBeInTheDocument()
    expect(screen.queryByText('members only content')).not.toBeInTheDocument()
  })

  it('renders the page for an approved member', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, pendingUser: null })
    render(
      <MemoryRouter>
        <Gated />
      </MemoryRouter>,
    )
    expect(screen.getByText('members only content')).toBeInTheDocument()
  })
})
