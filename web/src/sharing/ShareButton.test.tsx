import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ShareButton } from './ShareButton'

const mockUseAuth = vi.fn()
vi.mock('../auth/AuthContext', () => ({ useAuth: () => mockUseAuth() }))

// Ionic's IonFabButton doesn't expose a standard accessible "button" role in
// jsdom (it's a Stencil web component, not a plain <button>), so we click the
// underlying custom element directly rather than via getByRole.
function openShareModal(container: HTMLElement) {
  const fab = container.querySelector('ion-fab-button')
  if (!fab) throw new Error('share fab button not found')
  fireEvent.click(fab)
}

describe('ShareButton', () => {
  it('shares a plain URL with no invite param when logged out', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    const { container } = render(
      <MemoryRouter initialEntries={['/events/abc123']}>
        <ShareButton />
      </MemoryRouter>,
    )
    openShareModal(container)

    await waitFor(() => {
      expect(screen.getByText(/\/events\/abc123$/)).toBeInTheDocument()
    })
  })

  it('appends ?invite=<user id> to the shared URL when logged in', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-42', name: 'Sam Rivera' } })
    const { container } = render(
      <MemoryRouter initialEntries={['/events/abc123']}>
        <ShareButton />
      </MemoryRouter>,
    )
    openShareModal(container)

    await waitFor(() => {
      expect(screen.getByText(/\/events\/abc123\?invite=user-42$/)).toBeInTheDocument()
    })
  })
})
