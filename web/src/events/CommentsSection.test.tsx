import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CommentsSection } from './CommentsSection'
import type { EventComment } from './api'

const mockFetch = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
vi.mock('./api', () => ({
  fetchEventComments: (...args: unknown[]) => mockFetch(...args),
  createEventComment: (...args: unknown[]) => mockCreate(...args),
  updateEventComment: (...args: unknown[]) => mockUpdate(...args),
  deleteEventComment: (...args: unknown[]) => mockDelete(...args),
}))

function comment(overrides: Partial<EventComment> = {}): EventComment {
  return {
    id: 'c1',
    event_id: 'e1',
    body: 'Looking forward to this!',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    author_id: 'u1',
    author_name: 'Ben Haley',
    author_avatar_url: null,
    can_edit: false,
    can_delete: false,
    ...overrides,
  }
}

// Ionic's IonTextarea/IonButton are Stencil web components — jsdom doesn't
// hydrate them into real form controls, so drive the underlying custom
// element's raw event directly (same pattern as JoinGate.test.tsx).
function typeIntoIonTextarea(el: Element, value: string) {
  Object.defineProperty(el, 'value', { value, writable: true, configurable: true })
  fireEvent(el, new CustomEvent('ionInput', { detail: { value }, bubbles: true }))
}

describe('CommentsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows just the "Add a comment" prompt when the list is empty, with no separate empty-state message', async () => {
    mockFetch.mockResolvedValue([])
    render(<CommentsSection eventId="e1" />)
    expect(await screen.findByPlaceholderText('Add a comment')).toBeInTheDocument()
    expect(screen.queryByText('No comments yet')).not.toBeInTheDocument()
  })

  it('hides the Post button until the viewer starts typing', async () => {
    mockFetch.mockResolvedValue([])
    const { container } = render(<CommentsSection eventId="e1" />)
    await screen.findByPlaceholderText('Add a comment')
    expect(screen.queryByText('Post')).not.toBeInTheDocument()

    const textarea = container.querySelector('ion-textarea')!
    typeIntoIonTextarea(textarea, 'Hello')
    expect(await screen.findByText('Post')).toBeInTheDocument()
  })

  it('renders existing comments with author and body', async () => {
    mockFetch.mockResolvedValue([comment()])
    render(<CommentsSection eventId="e1" />)
    expect(await screen.findByText('Ben Haley')).toBeInTheDocument()
    expect(screen.getByText('Looking forward to this!')).toBeInTheDocument()
  })

  it('posts a new comment and puts it at the top of the list (newest first)', async () => {
    mockFetch.mockResolvedValue([comment({ id: 'old', body: 'Older comment' })])
    mockCreate.mockResolvedValue(comment({ id: 'new', body: 'Count me in' }))
    const { container } = render(<CommentsSection eventId="e1" />)
    await screen.findByText('Older comment')

    const textarea = container.querySelector('ion-textarea')!
    typeIntoIonTextarea(textarea, 'Count me in')
    fireEvent.click(screen.getByText('Post').closest('ion-button')!)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('e1', 'Count me in')
    })
    await screen.findByText('Count me in')

    const text = container.textContent ?? ''
    expect(text.indexOf('Count me in')).toBeLessThan(text.indexOf('Older comment'))
  })

  it('shows Edit/Delete only when the server says the viewer may act on a comment', async () => {
    mockFetch.mockResolvedValue([comment({ can_edit: true, can_delete: true })])
    render(<CommentsSection eventId="e1" />)
    await screen.findByText('Looking forward to this!')
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('hides Edit/Delete for a comment the viewer cannot act on', async () => {
    mockFetch.mockResolvedValue([comment({ can_edit: false, can_delete: false })])
    render(<CommentsSection eventId="e1" />)
    await screen.findByText('Looking forward to this!')
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('edits a comment in place', async () => {
    mockFetch.mockResolvedValue([comment({ can_edit: true })])
    mockUpdate.mockResolvedValue(comment({ can_edit: true, body: 'Updated text' }))
    const { container } = render(<CommentsSection eventId="e1" />)
    await screen.findByText('Looking forward to this!')

    fireEvent.click(screen.getByText('Edit').closest('ion-button')!)
    const textarea = container.querySelector('ion-textarea')!
    typeIntoIonTextarea(textarea, 'Updated text')
    fireEvent.click(screen.getByText('Save').closest('ion-button')!)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('e1', 'c1', 'Updated text')
    })
    expect(await screen.findByText('Updated text')).toBeInTheDocument()
  })

  it('deletes a comment after confirmation and removes it from the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockFetch.mockResolvedValue([comment({ can_delete: true })])
    mockDelete.mockResolvedValue(undefined)
    render(<CommentsSection eventId="e1" />)
    await screen.findByText('Looking forward to this!')

    const deleteButton = document.querySelector('ion-button[color="danger"]')!
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('e1', 'c1')
    })
    expect(screen.queryByText('Looking forward to this!')).not.toBeInTheDocument()
  })

  it('keeps the comment visible if the user cancels the delete confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockFetch.mockResolvedValue([comment({ can_delete: true })])
    render(<CommentsSection eventId="e1" />)
    await screen.findByText('Looking forward to this!')

    const deleteButton = document.querySelector('ion-button[color="danger"]')!
    fireEvent.click(deleteButton)

    expect(mockDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Looking forward to this!')).toBeInTheDocument()
  })
})
