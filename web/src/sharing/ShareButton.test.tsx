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

// Leaving IonModal open across a test boundary lets its present()/dismiss()
// lifecycle promises resolve after testing-library's cleanup has already
// torn the tree down, surfacing as an unrelated-looking "framework delegate
// is missing" unhandled rejection in a later test — so every test below
// closes it before finishing. It portals its content to document.body
// rather than rendering inline under the component's own container, so the
// close button has to be found document-wide, unlike the fab button above.
async function closeShareModal() {
  // The modal's real DOM attachment happens asynchronously (Stencil watches
  // the isOpen prop and calls present() outside the current tick), so a
  // synchronous querySelector right after opening can race it — wait for the
  // close button to actually exist rather than assuming it already does.
  const closeButton = await waitFor(() => {
    const el = document.querySelector('ion-header ion-button')
    if (!el) throw new Error('share modal close button not found')
    return el
  })
  fireEvent.click(closeButton)
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

    // The URL itself is never rendered as visible text (feedback, 2026-08-05:
    // "no reason for an HTTPS URL written out as plain text") — it's only
    // encoded in the QR image, so assert against that image's alt text.
    await waitFor(() => {
      expect(screen.getByAltText(/\/events\/abc123$/)).toBeInTheDocument()
    })
    await closeShareModal()
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
      expect(screen.getByAltText(/\/events\/abc123\?invite=user-42$/)).toBeInTheDocument()
    })
    await closeShareModal()
  })

  // jsdom has no navigator.share, matching a plain desktop browser — the
  // native share button (feedback #58) must not render a dead control there.
  it('does not render the native share button when navigator.share is unsupported', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    const { container } = render(
      <MemoryRouter initialEntries={['/events/abc123']}>
        <ShareButton />
      </MemoryRouter>,
    )
    openShareModal(container)

    expect(screen.queryByText('Share via Text, Email, etc.')).not.toBeInTheDocument()
    await closeShareModal()
  })

  it('calls navigator.share with the current page URL when the native share button is tapped', async () => {
    // Defining just the one method (rather than replacing the whole
    // `navigator` object, e.g. via vi.stubGlobal) keeps every other property
    // Ionic's own internals read from navigator (userAgent, platform
    // detection, etc.) intact.
    const shareMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true })
    mockUseAuth.mockReturnValue({ user: null })
    const { container } = render(
      <MemoryRouter initialEntries={['/events/abc123']}>
        <ShareButton />
      </MemoryRouter>,
    )
    openShareModal(container)

    const shareButton = await screen.findByText('Share via Text, Email, etc.')
    fireEvent.click(shareButton)

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalledWith({ url: expect.stringContaining('/events/abc123') })
    })
    delete (navigator as { share?: unknown }).share
    await closeShareModal()
  })
})
