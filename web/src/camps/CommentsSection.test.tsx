import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CommentsSection } from './CommentsSection'
import type { CampComment } from './api'

const mockFetch = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
vi.mock('./api', () => ({
  fetchCampComments: (...args: unknown[]) => mockFetch(...args),
  createCampComment: (...args: unknown[]) => mockCreate(...args),
  updateCampComment: (...args: unknown[]) => mockUpdate(...args),
  deleteCampComment: (...args: unknown[]) => mockDelete(...args),
}))

function comment(overrides: Partial<CampComment> = {}): CampComment {
  return {
    id: 'c1',
    camp_id: 'camp1',
    body: 'Our kids loved this one!',
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
// element's raw event directly (same pattern as events/CommentsSection.test.tsx).
function typeIntoIonTextarea(el: Element, value: string) {
  Object.defineProperty(el, 'value', { value, writable: true, configurable: true })
  fireEvent(el, new CustomEvent('ionInput', { detail: { value }, bubbles: true }))
}

describe('CommentsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "No comments yet" when the list is empty', async () => {
    mockFetch.mockResolvedValue([])
    render(<CommentsSection campId="camp1" />)
    expect(await screen.findByText('No comments yet')).toBeInTheDocument()
  })

  it('renders existing comments with author and body', async () => {
    mockFetch.mockResolvedValue([comment()])
    render(<CommentsSection campId="camp1" />)
    expect(await screen.findByText('Ben Haley')).toBeInTheDocument()
    expect(screen.getByText('Our kids loved this one!')).toBeInTheDocument()
  })

  it('posts a new comment and puts it at the top of the list (newest first)', async () => {
    mockFetch.mockResolvedValue([comment({ id: 'old', body: 'Older comment' })])
    mockCreate.mockResolvedValue(comment({ id: 'new', body: 'Count me in' }))
    const { container } = render(<CommentsSection campId="camp1" />)
    await screen.findByText('Older comment')

    const textarea = container.querySelector('ion-textarea')!
    typeIntoIonTextarea(textarea, 'Count me in')
    fireEvent.click(screen.getByText('Post').closest('ion-button')!)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('camp1', 'Count me in')
    })
    await screen.findByText('Count me in')

    const text = container.textContent ?? ''
    expect(text.indexOf('Count me in')).toBeLessThan(text.indexOf('Older comment'))
  })

  it('shows Edit/Delete only when the server says the viewer may act on a comment', async () => {
    mockFetch.mockResolvedValue([comment({ can_edit: true, can_delete: true })])
    render(<CommentsSection campId="camp1" />)
    await screen.findByText('Our kids loved this one!')
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('hides Edit/Delete for a comment the viewer cannot act on', async () => {
    mockFetch.mockResolvedValue([comment({ can_edit: false, can_delete: false })])
    render(<CommentsSection campId="camp1" />)
    await screen.findByText('Our kids loved this one!')
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('edits a comment in place', async () => {
    mockFetch.mockResolvedValue([comment({ can_edit: true })])
    mockUpdate.mockResolvedValue(comment({ can_edit: true, body: 'Updated text' }))
    const { container } = render(<CommentsSection campId="camp1" />)
    await screen.findByText('Our kids loved this one!')

    fireEvent.click(screen.getByText('Edit').closest('ion-button')!)
    const textarea = container.querySelector('ion-textarea')!
    typeIntoIonTextarea(textarea, 'Updated text')
    fireEvent.click(screen.getByText('Save').closest('ion-button')!)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('camp1', 'c1', 'Updated text')
    })
    expect(await screen.findByText('Updated text')).toBeInTheDocument()
  })

  it('deletes a comment after confirmation and removes it from the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockFetch.mockResolvedValue([comment({ can_delete: true })])
    mockDelete.mockResolvedValue(undefined)
    render(<CommentsSection campId="camp1" />)
    await screen.findByText('Our kids loved this one!')

    const deleteButton = document.querySelector('ion-button[color="danger"]')!
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('camp1', 'c1')
    })
    expect(screen.queryByText('Our kids loved this one!')).not.toBeInTheDocument()
  })
})
