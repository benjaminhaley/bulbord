import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { CommentsSection } from './CommentsSection'
import type { CampComment, SourceNote } from './api'

const mockFetch = vi.fn()
const mockFetchNotes = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
vi.mock('./api', () => ({
  fetchCampComments: (...args: unknown[]) => mockFetch(...args),
  fetchCampSourceNotes: (...args: unknown[]) => mockFetchNotes(...args),
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

function sourceNote(overrides: Partial<SourceNote> = {}): SourceNote {
  return {
    id: 'n1',
    body: 'Great at the other date too!',
    created_at: '2026-07-01T00:00:00.000Z',
    author_name: 'Alice',
    author_avatar_url: null,
    camp_id: 'camp2',
    camp_start_date: '2026-11-02',
    camp_end_date: '2026-11-03',
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

function renderComments(source: { id: string; name: string } | null = null) {
  return render(
    <MemoryRouter>
      <CommentsSection campId="camp1" source={source} />
    </MemoryRouter>,
  )
}

describe('CommentsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchNotes.mockResolvedValue([])
  })

  it('shows just the "Add a comment" prompt when the list is empty, with no separate empty-state message', async () => {
    mockFetch.mockResolvedValue([])
    renderComments()
    expect(await screen.findByPlaceholderText('Add a comment')).toBeInTheDocument()
    expect(screen.queryByText('No comments yet')).not.toBeInTheDocument()
  })

  it('hides the Post button until the viewer starts typing', async () => {
    mockFetch.mockResolvedValue([])
    const { container } = renderComments()
    await screen.findByPlaceholderText('Add a comment')
    expect(screen.queryByText('Post')).not.toBeInTheDocument()

    const textarea = container.querySelector('ion-textarea')!
    typeIntoIonTextarea(textarea, 'Hello')
    expect(await screen.findByText('Post')).toBeInTheDocument()
  })

  it('renders existing comments with author and body', async () => {
    mockFetch.mockResolvedValue([comment()])
    renderComments()
    expect(await screen.findByText('Ben Haley')).toBeInTheDocument()
    expect(screen.getByText('Our kids loved this one!')).toBeInTheDocument()
  })

  it('posts a new comment and puts it at the top of the list (newest first)', async () => {
    mockFetch.mockResolvedValue([comment({ id: 'old', body: 'Older comment' })])
    mockCreate.mockResolvedValue(comment({ id: 'new', body: 'Count me in' }))
    const { container } = renderComments()
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
    renderComments()
    await screen.findByText('Our kids loved this one!')
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('hides Edit/Delete for a comment the viewer cannot act on', async () => {
    mockFetch.mockResolvedValue([comment({ can_edit: false, can_delete: false })])
    renderComments()
    await screen.findByText('Our kids loved this one!')
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('edits a comment in place', async () => {
    mockFetch.mockResolvedValue([comment({ can_edit: true })])
    mockUpdate.mockResolvedValue(comment({ can_edit: true, body: 'Updated text' }))
    const { container } = renderComments()
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
    renderComments()
    await screen.findByText('Our kids loved this one!')

    const deleteButton = document.querySelector('ion-button[color="danger"]')!
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('camp1', 'c1')
    })
    expect(screen.queryByText('Our kids loved this one!')).not.toBeInTheDocument()
  })

  it('does not fetch cross-listing notes when the camp has no source', async () => {
    mockFetch.mockResolvedValue([])
    renderComments(null)
    await screen.findByPlaceholderText('Add a comment')
    expect(mockFetchNotes).not.toHaveBeenCalled()
  })

  it('merges this camp\'s comments with other camps\' notes into one list, newest first', async () => {
    mockFetch.mockResolvedValue([comment({ id: 'own', body: 'Own comment', created_at: '2026-08-01T00:00:00.000Z' })])
    mockFetchNotes.mockResolvedValue([sourceNote({ id: 'other', body: 'Other date comment', created_at: '2026-08-03T00:00:00.000Z' })])
    const { container } = renderComments({ id: 'src1', name: 'Unicoi Art Studio' })

    await screen.findByText('Own comment')
    expect(screen.getByText('Other date comment')).toBeInTheDocument()

    const text = container.textContent ?? ''
    expect(text.indexOf('Other date comment')).toBeLessThan(text.indexOf('Own comment'))
  })

  it('shows a date link for a comment from another camp, but not for this camp\'s own comment', async () => {
    mockFetch.mockResolvedValue([comment({ id: 'own', body: 'Own comment' })])
    mockFetchNotes.mockResolvedValue([sourceNote({ id: 'other', body: 'Other date comment', camp_id: 'camp2' })])
    renderComments({ id: 'src1', name: 'Unicoi Art Studio' })

    await screen.findByText('Own comment')
    const dateLink = screen.getByRole('link', { name: 'Nov 2 – Nov 3' })
    expect(dateLink).toHaveAttribute('href', '/camps/camp2')
  })

  it('never shows Edit/Delete for another camp\'s note', async () => {
    mockFetch.mockResolvedValue([])
    mockFetchNotes.mockResolvedValue([sourceNote()])
    renderComments({ id: 'src1', name: 'Unicoi Art Studio' })

    await screen.findByText('Great at the other date too!')
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })
})
