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

  it('shows all three pipeline steps together immediately, not just once an earlier stage resolves', async () => {
    // Feedback, 2026-09-05: "Finding photo step doesn't appear at first.
    // Takes a second to show" — it used to only get added to the pipeline
    // once stage 1 finished. Hold stage 1/2 pending so this test can check
    // the DOM in the window before either resolves.
    let resolveExtract: (value: unknown) => void = () => {}
    let resolveDetails: (value: unknown) => void = () => {}
    mockExtractFromDescription.mockReturnValue(
      new Promise((resolve) => {
        resolveExtract = resolve
      }),
    )
    mockFindEventDetails.mockReturnValue(
      new Promise((resolve) => {
        resolveDetails = resolve
      }),
    )
    mockFindEventImage.mockResolvedValue(null)

    await openDescribeItAndSubmit()

    expect(await screen.findByText('Reading description…')).toBeInTheDocument()
    expect(screen.getByText('Searching online…')).toBeInTheDocument()
    expect(screen.getByText('Finding a photo…')).toBeInTheDocument()

    resolveExtract!({ title: 'Fall Festival', start_date: '2026-10-03', all_day: true })
    resolveDetails!(null)
    await waitFor(() => expect(screen.getByText(/Couldn't find a photo/)).toBeInTheDocument())
  })

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

describe('AddEventModal — retry with a note (feedback #165)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExtractFromDescription.mockResolvedValue({ title: 'Fall Festival', start_date: '2026-10-03', all_day: true })
    mockFindEventDetails.mockResolvedValue(null)
    mockFindEventImage.mockResolvedValue(null)
  })

  async function openDescribeItAndSubmit(text = 'the Nettelhorst fall festival this weekend') {
    const { rerender } = render(<AddEventModal isOpen={false} onClose={vi.fn()} onCreated={vi.fn()} />)
    rerender(<AddEventModal isOpen onClose={vi.fn()} onCreated={vi.fn()} />)
    const describeIt = await screen.findByText('Describe It')
    fireEvent.click(describeIt.closest('ion-button')!)
    const textarea = await screen.findByPlaceholderText(/Fall Festival at Nettelhorst Park/)
    typeIntoIonTextarea(textarea, text)
    fireEvent.click(screen.getByText('Look It Up').closest('ion-button')!)
  }

  // Feedback, 2026-09-14 (two live follow-ups the same day): first moved
  // into a sticky collapsible section (Ben: "I don't see any option to
  // retry" — it had scrolled out of view), then Ben asked for something
  // different: a real "Retry" button "near the post button" that "opens a
  // box with optional note" — a third button in EventForm's own Post/
  // Cancel row (see EventForm.tsx's extraAction prop), opening a small
  // modal. This finds and clicks that trigger button (the one NOT inside
  // the retry modal itself — before the modal opens there's exactly one
  // "Retry" text on screen; the modal's own submit button reuses the same
  // label).
  async function openRetryModal() {
    const triggerButton = await screen.findByText('Retry')
    fireEvent.click(triggerButton.closest('ion-button')!)
    await screen.findByPlaceholderText('Optional note')
  }

  function retrySubmitButton() {
    // Now two "Retry" texts exist — the trigger (outside the modal) and
    // this submit button (inside it, expand="block" so it renders full-width).
    return screen.getAllByText('Retry').find((el) => el.closest('ion-button')?.getAttribute('expand') === 'block')!.closest('ion-button')!
  }

  it('opens a modal with an optional note field when Retry is tapped', async () => {
    await openDescribeItAndSubmit()

    const noteField = document.querySelector<HTMLElement>('ion-textarea[placeholder="Optional note"]')
    expect(noteField).not.toBeInTheDocument()

    await openRetryModal()

    // Optional — the submit button inside the modal is never disabled just
    // because the note is empty (feedback: "you can also just retry with
    // no note").
    expect(retrySubmitButton()).not.toHaveAttribute('disabled')
  })

  it('re-runs stage 1 with the typed note and closes the modal on success', async () => {
    await openDescribeItAndSubmit('the Nettelhorst fall festival this weekend')
    await openRetryModal()
    mockExtractFromDescription.mockResolvedValue({ title: 'Nettelhorst Fall Festival', start_date: '2026-10-03', all_day: false, start_time: '10:00' })

    const noteField = document.querySelector<HTMLElement>('ion-textarea[placeholder="Optional note"]')!
    typeIntoIonTextarea(noteField, 'it actually starts at 10am, not all day')
    fireEvent.click(retrySubmitButton())

    await waitFor(() =>
      expect(mockExtractFromDescription).toHaveBeenCalledWith(
        'the Nettelhorst fall festival this weekend',
        'it actually starts at 10am, not all day',
      ),
    )
    await waitFor(() => expect(document.querySelector('ion-textarea[placeholder="Optional note"]')).not.toBeInTheDocument())
  })

  it('retries with no note at all', async () => {
    await openDescribeItAndSubmit('the Nettelhorst fall festival this weekend')
    await openRetryModal()

    fireEvent.click(retrySubmitButton())

    await waitFor(() => expect(mockExtractFromDescription).toHaveBeenCalledWith('the Nettelhorst fall festival this weekend', undefined))
  })

  it('never re-uploads a photo or re-runs the web search on retry — only stage 1', async () => {
    await openDescribeItAndSubmit()
    await openRetryModal()

    const noteField = document.querySelector<HTMLElement>('ion-textarea[placeholder="Optional note"]')!
    typeIntoIonTextarea(noteField, 'check the /rates page for the real price')
    fireEvent.click(retrySubmitButton())

    await waitFor(() => expect(mockExtractFromDescription).toHaveBeenCalledTimes(2))
    // findEventDetailsFromDescription (stage 2) only ran once, during the
    // original submit — a retry note is instructions for re-reading the
    // description, not a reason to re-search the web.
    expect(mockFindEventDetails).toHaveBeenCalledTimes(1)
  })
})
