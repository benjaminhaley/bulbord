import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { loginPath, LoginPage, requiresLogin } from './LoginPrompt'

const mockUseAuth = vi.fn()
vi.mock('./AuthContext', () => ({ useAuth: () => mockUseAuth() }))

function Secret() {
  return <div>members only content</div>
}

function Where() {
  const location = useLocation()
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>
}

// Feedback #175: sign-in is a real /login page (own URL, so back works), and a
// whole page that only makes sense signed in redirects there.
describe('requiresLogin', () => {
  const Gated = requiresLogin(Secret, 'Sign in to read and post feedback')

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Route path="/feedback" component={Gated} />
        <Route path="/login" component={Where} />
      </MemoryRouter>,
    )
  }

  it('redirects an anonymous visitor to /login with the reason and a way back', () => {
    mockUseAuth.mockReturnValue({ user: null })
    renderAt('/feedback')
    expect(screen.getByTestId('where').textContent).toBe(loginPath('Sign in to read and post feedback', '/feedback'))
    expect(screen.queryByText('members only content')).not.toBeInTheDocument()
  })

  it('renders the page for an approved member', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } })
    renderAt('/feedback')
    expect(screen.getByText('members only content')).toBeInTheDocument()
  })
})

describe('LoginPage', () => {
  function renderLogin(search: string) {
    return render(
      <MemoryRouter initialEntries={[`/login${search}`]}>
        <Route path="/login" component={LoginPage} />
        <Route path="/events/abc" component={Where} />
        <Route path="/events" exact component={Where} />
      </MemoryRouter>,
    )
  }

  it('leads with the reason it was opened for, with no brand header', () => {
    mockUseAuth.mockReturnValue({ user: null, pendingUser: null, refresh: vi.fn() })
    renderLogin('?reason=Sign%20in%20to%20mark%20events%20you%E2%80%99re%20interested%20in&next=%2Fevents%2Fabc')
    expect(screen.getByText('Sign in to mark events you’re interested in')).toBeInTheDocument()
    expect(screen.queryByText('A bulletin board for the Nettelhorst community')).not.toBeInTheDocument()
    expect(screen.getByText('Learn more')).toBeInTheDocument()
  })

  it('tells a pending account its approval is outstanding', () => {
    mockUseAuth.mockReturnValue({ user: null, pendingUser: { id: 'u9' }, logout: vi.fn() })
    renderLogin('?next=%2Fevents')
    expect(screen.getByText("You're on the list")).toBeInTheDocument()
  })

  it('sends a member on to `next` once signed in', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, pendingUser: null })
    renderLogin('?next=%2Fevents%2Fabc')
    expect(screen.getByTestId('where').textContent).toBe('/events/abc')
  })

  it('ignores an off-site or self-referential `next`', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, pendingUser: null })
    renderLogin('?next=%2F%2Fevil.example')
    expect(screen.getByTestId('where').textContent).toBe('/events')
  })
})
