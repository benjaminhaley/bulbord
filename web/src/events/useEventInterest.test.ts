import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Event } from './api'

const setEventInterestMock = vi.fn()
const clearEventInterestMock = vi.fn()
let mockUser: { avatarUrl: string | null } | null = { avatarUrl: 'https://example.com/me.jpg' }

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }))
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  setEventInterest: (...args: unknown[]) => setEventInterestMock(...args),
  clearEventInterest: (...args: unknown[]) => clearEventInterestMock(...args),
}))

// Feedback #145 (2026-09-04): marking interested used to only patch
// interest_status locally, leaving interested_count/interested_people stale
// until the next real fetch — a member wouldn't see their own avatar appear
// in the "N interested" stack until they left and came back to the screen.
const { useEventInterest } = await import('./useEventInterest.js')

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'event-1',
    title: 'Test Event',
    description: null,
    start_date: '2026-09-10',
    start_time: null,
    end_time: null,
    all_day: true,
    address: null,
    location_name: null,
    source_url: null,
    image_url: null,
    thumbnail_url: null,
    interest_status: null,
    interested_count: 0,
    interested_people: [],
    can_edit: false,
    submitted_by: null,
    topic: null,
    ...overrides,
  }
}

describe('useEventInterest', () => {
  it('adds the viewer as "You" and bumps the count immediately when marking interested', async () => {
    setEventInterestMock.mockResolvedValue(undefined)
    let updated: Event | null = null
    const { result } = renderHook(() => useEventInterest((event) => (updated = event)))

    await result.current.setInterest(makeEvent(), 'interested')

    await waitFor(() => expect(updated).not.toBeNull())
    expect(updated!.interest_status).toBe('interested')
    expect(updated!.interested_count).toBe(1)
    expect(updated!.interested_people).toEqual([{ name: 'You', avatar_url: 'https://example.com/me.jpg' }])
  })

  it('removes the viewer and decrements the count immediately when dismissing from interested', async () => {
    setEventInterestMock.mockResolvedValue(undefined)
    const startingEvent = makeEvent({
      interest_status: 'interested',
      interested_count: 2,
      interested_people: [
        { name: 'You', avatar_url: 'https://example.com/me.jpg' },
        { name: 'Alice', avatar_url: null },
      ],
    })
    let updated: Event | null = null
    const { result } = renderHook(() => useEventInterest((event) => (updated = event)))

    await result.current.setInterest(startingEvent, 'dismissed')

    await waitFor(() => expect(updated).not.toBeNull())
    expect(updated!.interest_status).toBe('dismissed')
    expect(updated!.interested_count).toBe(1)
    expect(updated!.interested_people).toEqual([{ name: 'Alice', avatar_url: null }])
  })

  it('removes the viewer and decrements the count immediately when clearing interest', async () => {
    clearEventInterestMock.mockResolvedValue(undefined)
    const startingEvent = makeEvent({
      interest_status: 'interested',
      interested_count: 1,
      interested_people: [{ name: 'You', avatar_url: 'https://example.com/me.jpg' }],
    })
    let updated: Event | null = null
    const { result } = renderHook(() => useEventInterest((event) => (updated = event)))

    await result.current.clearInterest(startingEvent)

    await waitFor(() => expect(updated).not.toBeNull())
    expect(updated!.interest_status).toBeNull()
    expect(updated!.interested_count).toBe(0)
    expect(updated!.interested_people).toEqual([])
  })

  it('does not double-count when marking interested while already interested', async () => {
    setEventInterestMock.mockResolvedValue(undefined)
    const startingEvent = makeEvent({
      interest_status: 'interested',
      interested_count: 1,
      interested_people: [{ name: 'You', avatar_url: 'https://example.com/me.jpg' }],
    })
    let updated: Event | null = null
    const { result } = renderHook(() => useEventInterest((event) => (updated = event)))

    await result.current.setInterest(startingEvent, 'interested')

    await waitFor(() => expect(updated).not.toBeNull())
    expect(updated!.interested_count).toBe(1)
    expect(updated!.interested_people).toEqual([{ name: 'You', avatar_url: 'https://example.com/me.jpg' }])
  })

  it('falls back to a null avatar when the viewer has none', async () => {
    mockUser = { avatarUrl: null }
    setEventInterestMock.mockResolvedValue(undefined)
    let updated: Event | null = null
    const { result } = renderHook(() => useEventInterest((event) => (updated = event)))

    await result.current.setInterest(makeEvent(), 'interested')

    await waitFor(() => expect(updated).not.toBeNull())
    expect(updated!.interested_people).toEqual([{ name: 'You', avatar_url: null }])
    mockUser = { avatarUrl: 'https://example.com/me.jpg' }
  })
})
