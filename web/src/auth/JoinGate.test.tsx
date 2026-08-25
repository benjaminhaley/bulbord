import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { JoinGate } from './JoinGate'
import { getToken } from './token'

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

  // The manual "have a sign-in link instead?" fallback (added after Apple
  // rejected build 14 for opening the sign-in link in Safari instead of the
  // app — see CLAUDE.md's Platform strategy) doesn't depend on Universal
  // Link hand-off at all: typing/pasting the link directly into this field
  // never leaves the running app.
  it('lets a pasted sign-in link store its token and trigger a refresh', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, refresh })
    const { container } = renderGate('/events')

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

  it('shows the inviter\'s name once the invite lookup resolves', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false })
    renderGate('/events?invite=user-42')
    expect(await screen.findByText('Sam Rivera invited you')).toBeInTheDocument()
  })

  it('shows the plain About page for a non-member visiting /about with no invite param', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false })
    renderGate('/about')
    expect(screen.getByText('About Nettelhorst Bulbord')).toBeInTheDocument()
  })

  // Real incident, 2026-08-22: ShareButton encodes whatever page the sharer
  // is on, so an invite generated from the About page is shaped exactly
  // like this — `/about?invite=...`. The gate must route this to the real
  // invite-accept screen, not silently swallow it into the plain About page
  // with no way to actually join (see JoinGate.tsx's own comment on this).
  it('shows the invite-accept screen, not the plain About page, when /about carries a pending invite', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false })
    renderGate('/about?invite=user-42')
    expect(await screen.findByText('Sam Rivera invited you')).toBeInTheDocument()
    expect(screen.queryByText('About Nettelhorst Bulbord')).not.toBeInTheDocument()
  })

  // A pending invite wins over *any* path, not just /about's known bypass —
  // this is the general fix: the priority check runs once, before any
  // route-specific pre-auth content, so a future bypass on some other page
  // can't reintroduce the same failure mode by accident.
  it('shows the invite-accept screen for a pending invite on an arbitrary path, not just /about', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false })
    renderGate('/camps/some-camp-id?invite=user-42')
    expect(await screen.findByText('Sam Rivera invited you')).toBeInTheDocument()
  })

  it('a root-secret bootstrap link also wins over /about\'s bypass', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false })
    renderGate('/about?rootSecret=shh')
    expect(screen.getByText('Join Nettelhorst Bulbord')).toBeInTheDocument()
    expect(screen.queryByText('About Nettelhorst Bulbord')).not.toBeInTheDocument()
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
