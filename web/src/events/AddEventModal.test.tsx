import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AddEventModal } from './AddEventModal'

const mockCreateEvent = vi.fn()
const mockUpdateEvent = vi.fn()
const mockExtractFromPhoto = vi.fn()
const mockFindEventSource = vi.fn()
const mockExtractFromDescription = vi.fn()
const mockFindEventDetails = vi.fn()
const mockFindEventImage = vi.fn()

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    createEvent: (...args: unknown[]) => mockCreateEvent(...args),
    updateEvent: (...args: unknown[]) => mockUpdateEvent(...args),
    extractEventFieldsFromPhoto: (...args: unknown[]) => mockExtractFromPhoto(...args),
    findEventSource: (...args: unknown[]) => mockFindEventSource(...args),
    extractEventFieldsFromDescription: (...args: unknown[]) => mockExtractFromDescription(...args),
    findEventDetailsFromDescription: (...args: unknown[]) => mockFindEventDetails(...args),
    findEventImage: (...args: unknown[]) => mockFindEventImage(...args),
  }
})

// Ionic's IonTextarea/IonButton are Stencil web components — jsdom doesn't
// hydrate them into real form controls, so drive the underlying custom
// element's raw event directly (same pattern as CommentsSection.test.tsx).
function typeIntoIonTextarea(el: Element, value: string) {
  Object.defineProperty(el, 'value', { value, writable: true, configurable: true })
  fireEvent(el, new CustomEvent('ionInput', { detail: { value }, bubbles: true }))
}

describe('AddEventModal — Describe It flow (feedback #133)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExtractFromDescription.mockResolvedValue({
      title: 'Fall Festival',
      start_date: '2026-10-03',
      all_day: true,
    })
    mockFindEventDetails.mockResolvedValue({
      source_url: 'https://nettelhorst.org/fall-festival',
      source_name: 'Nettelhorst PTA',
    })
  })

  async function openDescribeItAndSubmit(text = 'the Nettelhorst fall festival this weekend') {
    // IonModal's overlay controller needs to see a real closed→open
    // transition to attach its framework delegate — mounting directly with
    // isOpen already true (as this modal's real caller, EventsPage, never
    // does either) throws "framework delegate is missing" and the portaled
    // content never mounts at all. Render closed, then rerender open, same
    // as a real toggle would produce.
    const { rerender } = render(<AddEventModal isOpen={false} onClose={vi.fn()} onCreated={vi.fn()} />)
    rerender(<AddEventModal isOpen onClose={vi.fn()} onCreated={vi.fn()} />)
    // present() attaches the portaled content asynchronously, outside this
    // tick — findByText (unlike getByText) polls until it actually exists.
    const describeIt = await screen.findByText('Describe It')
    fireEvent.click(describeIt.closest('ion-button')!)
    const textarea = await screen.findByPlaceholderText(/Fall Festival at Nettelhorst Park/)
    typeIntoIonTextarea(textarea, text)
    fireEvent.click(screen.getByText('Look It Up').closest('ion-button')!)
  }

  it('shows a real photo stage 3 finds, large and pinned, before the member ever posts', async () => {
    mockFindEventImage.mockResolvedValue({
      image_url: '/uploads/events/found-photo.jpg',
      thumbnail_url: '/uploads/events/found-photo-thumb.jpg',
    })

    await openDescribeItAndSubmit()

    expect(await screen.findByText('Found a photo')).toBeInTheDocument()
    const img = await screen.findByAltText('Photo found for this event')
    expect(img.getAttribute('src')).toContain('/uploads/events/found-photo.jpg')

    // All three pipeline steps read as complete, in order.
    expect(screen.getByText('Read details from description')).toBeInTheDocument()
    expect(screen.getByText('Found more details online')).toBeInTheDocument()
  })

  it('shows a loading placeholder in the photo\'s own spot while stage 3 is still searching', async () => {
    let resolveImage: (value: unknown) => void = () => {}
    mockFindEventImage.mockReturnValue(
      new Promise((resolve) => {
        resolveImage = resolve
      }),
    )

    await openDescribeItAndSubmit()

    expect(await screen.findByText('Finding a photo…')).toBeInTheDocument()
    expect(screen.queryByAltText('Photo found for this event')).not.toBeInTheDocument()
    // The placeholder box itself has no accessible text/alt — assert via
    // the spinner it contains, the same "still working" signal the other
    // pipeline rows use.
    expect(document.querySelectorAll('ion-spinner').length).toBeGreaterThan(1)

    resolveImage!({ image_url: '/uploads/events/found-photo.jpg', thumbnail_url: '/uploads/events/found-photo-thumb.jpg' })
    expect(await screen.findByAltText('Photo found for this event')).toBeInTheDocument()
  })

  it('shows a clear "not found" step instead of silently having no photo at all', async () => {
    mockFindEventImage.mockResolvedValue(null)

    await openDescribeItAndSubmit()

    expect(await screen.findByText(/Couldn't find a photo/)).toBeInTheDocument()
    expect(screen.queryByAltText('Photo found for this event')).not.toBeInTheDocument()
  })

  it('calls findEventImage with the richest fields available (preferring stage 2 over stage 1)', async () => {
    mockFindEventImage.mockResolvedValue(null)

    await openDescribeItAndSubmit()

    await waitFor(() => expect(mockFindEventImage).toHaveBeenCalled())
    expect(mockFindEventImage).toHaveBeenCalledWith(
      expect.objectContaining({
        source_url: 'https://nettelhorst.org/fall-festival',
        title: 'Fall Festival',
      }),
    )
  })

  it('never calls findEventImage before stage 2 has resolved', async () => {
    let resolveStage2: (value: unknown) => void = () => {}
    mockFindEventDetails.mockReturnValue(
      new Promise((resolve) => {
        resolveStage2 = resolve
      }),
    )
    mockFindEventImage.mockResolvedValue(null)

    await openDescribeItAndSubmit()
    await screen.findByText('Read details from description')

    // Stage 2 is still pending — stage 3 must not have started yet.
    expect(mockFindEventImage).not.toHaveBeenCalled()

    resolveStage2!({ source_url: 'https://nettelhorst.org/fall-festival', source_name: 'Nettelhorst PTA' })
    await waitFor(() => expect(mockFindEventImage).toHaveBeenCalled())
  })
})
