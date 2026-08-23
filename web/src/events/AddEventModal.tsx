import { IonButton, IonContent, IonHeader, IonIcon, IonModal, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/react'
import { cameraOutline, closeOutline } from 'ionicons/icons'
import { useRef, useState } from 'react'

import { unstyledButtonStyle } from '../theme/layout'
import type { UploadedImage } from '../uploads/api'
import { uploadImage } from '../uploads/api'
import {
  createEvent,
  extractEventFieldsFromPhoto,
  findEventSource,
  updateEvent,
  type DiscoveredEventSource,
  type Event,
  type EventInput,
  type ExtractedEventFields,
} from './api'
import { EventForm, type EventFormInitialValues } from './EventForm'

function combinedAddress(extracted: ExtractedEventFields | null): string | null {
  if (!extracted) return null
  // Ben, 2026-08-23: "make sure the location includes both the location
  // name... and the address" — the member self-service form has one
  // Location field (not the separate location_name/address split sourced
  // events carry), so both real pieces of information belong in that one
  // string when both are known, rather than one silently winning.
  if (extracted.location_name && extracted.address) return `${extracted.location_name}, ${extracted.address}`
  return extracted.address ?? extracted.location_name ?? null
}

function toInitialValues(extracted: ExtractedEventFields | null, image: UploadedImage): EventFormInitialValues {
  return {
    title: extracted?.title ?? '',
    description: extracted?.description ?? null,
    start_date: extracted?.start_date ?? '',
    all_day: extracted?.all_day ?? false,
    start_time: extracted?.start_time ?? null,
    address: combinedAddress(extracted),
    // Found either printed on the poster itself (stage 1, free) or via the
    // background stage-2 live search — see the sourceUrlSuggestion prop on
    // EventForm for how a stage-2 result reaches an already-open form.
    source_url: extracted?.source_url ?? null,
    topic: extracted?.topic ?? null,
    image_url: image.image_url,
    thumbnail_url: image.thumbnail_url,
  }
}

// One attempt's worth of mutable state that the stage-2 background search
// needs to keep reading/writing after it resolves — which can happen well
// after this component has re-rendered onto a different attempt, or closed
// entirely. A fresh object per handleFile() call (not a flat set of refs)
// so a late-resolving OLD attempt's search can never cross-contaminate a
// NEWER attempt's state — see handleFile's own comment.
interface PhotoSession {
  cancelled: boolean
  createdEvent: Event | null
  sourceUrlSuggestion: string | null
  sourceName: string | null
}

async function patchDiscoveredSource(event: Event, found: DiscoveredEventSource): Promise<void> {
  try {
    await updateEvent(event.id, {
      title: event.title,
      description: event.description ?? '',
      start_date: event.start_date,
      start_time: event.start_time?.slice(0, 5) ?? '',
      all_day: event.all_day,
      address: event.address ?? '',
      source_url: found.source_url,
      image_url: event.image_url,
      thumbnail_url: event.thumbnail_url,
      topic: event.topic ?? '',
      source_name: found.source_name,
    })
  } catch {
    // Best-effort, silent — a failed background patch just means the
    // source never got attached/registered; the event itself already
    // posted successfully and nothing else depends on this succeeding.
  }
}

// Feedback #93 ("take a picture of a poster... have everything auto
// populate"), restyled and re-architected 2026-08-23 per direct feedback:
// (1) a full-screen modal, not inline content pushed above the events list
// — "you don't need to see existing events when you're adding a new event";
// (2) Add from Photo leads as the primary, spacious choice, manual entry a
// small subtitle link; (3) a real two-stage pipeline — a fast vision-only
// pass fills the form immediately, then a slower live web search for the
// event's source runs in the background while the member is already
// reviewing/editing, and keeps going even after Post is tapped, patching
// the source in afterward rather than blocking submission on it.
export function AddEventModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated: (event: Event) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<'choice' | 'processing' | 'form'>('choice')
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [choiceError, setChoiceError] = useState<string | null>(null)
  const [initialValues, setInitialValues] = useState<EventFormInitialValues | null>(null)
  const [formNote, setFormNote] = useState<string | null>(null)
  const [sourceUrlSuggestion, setSourceUrlSuggestion] = useState<string | null>(null)
  const [sourceSearching, setSourceSearching] = useState(false)

  // Points at the most recent handleFile() attempt's session for as long as
  // it's the one on screen — used only to guard live UI updates (setState
  // calls) against a stale/late resolution; never read by the session's own
  // closure below, which always captures its own `session` object directly.
  const activeSessionRef = useRef<PhotoSession | null>(null)

  function resetVisibleState() {
    setStage('choice')
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setChoiceError(null)
    setInitialValues(null)
    setFormNote(null)
    setSourceUrlSuggestion(null)
    setSourceSearching(false)
  }

  function handleDismiss() {
    // Explicit cancel — this attempt is abandoned. If stage 2 is still in
    // flight it'll see `cancelled` and do nothing when it resolves, since
    // there's no open form to update and (if `createdEvent` is also unset)
    // nothing was ever posted to patch either.
    if (activeSessionRef.current) activeSessionRef.current.cancelled = true
    resetVisibleState()
    onClose()
  }

  function runSourceSearch(session: PhotoSession, fields: Pick<ExtractedEventFields, 'title' | 'location_name' | 'address'>) {
    setSourceSearching(true)
    findEventSource({ title: fields.title, location_name: fields.location_name, address: fields.address })
      .then((found) => {
        if (activeSessionRef.current === session) setSourceSearching(false)
        if (!found) return

        session.sourceUrlSuggestion = found.source_url
        session.sourceName = found.source_name

        if (session.createdEvent) {
          // Already posted by the time this resolved — only patch it in if
          // the created event doesn't already have its own source_url
          // (the member's own, or one already applied to the still-open
          // form before they submitted).
          if (!session.createdEvent.source_url) void patchDiscoveredSource(session.createdEvent, found)
          return
        }
        if (session.cancelled) return
        // Still on the form for this exact attempt — reflect it live.
        // EventForm itself only applies the suggestion if its own Source
        // URL field is still empty (see that component's own comment).
        if (activeSessionRef.current === session) setSourceUrlSuggestion(found.source_url)
      })
      .catch(() => {
        if (activeSessionRef.current === session) setSourceSearching(false)
      })
  }

  async function handleFile(file: File) {
    // A fresh session per attempt — see PhotoSession's own comment on why
    // this can't be a flat set of refs shared across attempts.
    const session: PhotoSession = { cancelled: false, createdEvent: null, sourceUrlSuggestion: null, sourceName: null }
    activeSessionRef.current = session

    const previewUrl = URL.createObjectURL(file)
    setPhotoPreviewUrl(previewUrl)
    setChoiceError(null)
    setStage('processing')

    let image: UploadedImage
    try {
      image = await uploadImage(file, 'events')
    } catch {
      if (session.cancelled) return
      setPhotoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setChoiceError('Could not upload that photo — try again, or enter the event manually below.')
      setStage('choice')
      return
    }

    let fields: ExtractedEventFields | null = null
    try {
      fields = await extractEventFieldsFromPhoto(image.image_url)
    } catch {
      fields = null
    }
    if (session.cancelled) return

    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setInitialValues(toInitialValues(fields, image))
    setFormNote(fields ? null : "Couldn't read the details from that photo — it's attached below, fill in the rest yourself.")
    setStage('form')

    // Stage 2, in the background — only worth it if stage 1 succeeded and
    // didn't already find a URL printed on the poster itself.
    if (fields && !fields.source_url) {
      runSourceSearch(session, fields)
    }
  }

  async function handleSubmit(input: EventInput) {
    const session = activeSessionRef.current
    const sourceName =
      session && input.source_url && input.source_url === session.sourceUrlSuggestion ? (session.sourceName ?? undefined) : undefined
    const created = await createEvent(sourceName ? { ...input, source_name: sourceName } : input)
    // Deliberately not cleared/reset here — the background search (if still
    // running) needs this to still be reachable once it resolves, so it can
    // patch the now-created event instead of trying to update a form that
    // no longer exists.
    if (session) session.createdEvent = created
    onCreated(created)
    resetVisibleState()
    onClose()
  }

  return (
    <IonModal isOpen={isOpen} onDidDismiss={handleDismiss}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Add Event</IonTitle>
          <IonButton slot="end" fill="clear" onClick={handleDismiss} aria-label="Close">
            <IonIcon slot="icon-only" icon={closeOutline} />
          </IonButton>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {stage === 'choice' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '32px 24px', textAlign: 'center' }}>
            <IonIcon icon={cameraOutline} style={{ fontSize: 56, color: 'var(--ion-color-primary)', marginBottom: 16 }} />
            <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem' }}>Add an Event</h2>
            <p style={{ color: 'var(--ion-color-medium)', margin: '0 0 32px', maxWidth: 280 }}>
              Snap a photo of a poster or flyer around town and we'll fill in the details for you.
            </p>
            {/* ionic-exception: Ionic has no file-picker component; a
                hidden native file input triggered by a real button is the
                standard pattern already used by EventForm's own photo
                attach. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.target.value = ''
              }}
            />
            <IonButton expand="block" size="large" style={{ width: '100%', maxWidth: 320 }} onClick={() => fileInputRef.current?.click()}>
              <IonIcon slot="start" icon={cameraOutline} />
              Add from Photo
            </IonButton>
            {choiceError && (
              <IonText color="danger">
                <p style={{ fontSize: '0.8125rem', margin: '12px 0 0', maxWidth: 280 }}>{choiceError}</p>
              </IonText>
            )}
            <p className="ion-margin-top" style={{ color: 'var(--ion-color-medium)', fontSize: '0.8125rem' }}>
              or{' '}
              <IonButton
                fill="clear"
                onClick={() => setStage('form')}
                style={{ ...unstyledButtonStyle, display: 'inline-flex', color: 'var(--ion-color-medium)', textDecoration: 'underline' }}
              >
                enter manually
              </IonButton>
            </p>
          </div>
        )}
        {stage === 'processing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '32px 24px', textAlign: 'center' }}>
            {photoPreviewUrl && (
              <img
                src={photoPreviewUrl}
                alt="Your photo"
                style={{ maxWidth: '100%', maxHeight: '45vh', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.2)', marginBottom: 24 }}
              />
            )}
            <IonSpinner name="dots" />
            <p style={{ color: 'var(--ion-color-medium)', margin: '12px 0 0' }}>Reading your photo…</p>
          </div>
        )}
        {stage === 'form' && (
          <>
            {formNote && (
              <IonText color="medium">
                <p style={{ fontSize: '0.8125rem', margin: '12px 16px 8px' }}>{formNote}</p>
              </IonText>
            )}
            <EventForm
              key={initialValues ? 'photo-prefill' : 'blank'}
              initial={initialValues ?? undefined}
              submitLabel="Post"
              errorMessage="Could not post this event"
              sourceUrlSuggestion={sourceUrlSuggestion}
              sourceSearching={sourceSearching}
              onSubmit={handleSubmit}
              onCancel={handleDismiss}
            />
          </>
        )}
      </IonContent>
    </IonModal>
  )
}
