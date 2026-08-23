import { IonButton, IonContent, IonHeader, IonIcon, IonModal, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/react'
import { cameraOutline, checkmarkCircle, closeCircleOutline, closeOutline } from 'ionicons/icons'
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

function toInitialValues(extracted: ExtractedEventFields | null, image: UploadedImage): EventFormInitialValues {
  return {
    title: extracted?.title ?? '',
    description: extracted?.description ?? null,
    start_date: extracted?.start_date ?? '',
    all_day: extracted?.all_day ?? false,
    start_time: extracted?.start_time ?? null,
    end_time: extracted?.end_time ?? null,
    // Kept as two real, separate fields (feedback, 2026-08-23: "make sure
    // the location has both a location name and a location address... the
    // name is the quick interpretable name... the address is a specific
    // thing that Google Maps would always get right") — the member
    // self-service form has always had both fields available server-side
    // (system-sourced events already carry location_name separately from
    // address), it just never exposed the split to a member posting their
    // own event until now. A real address the poster didn't print may
    // still arrive shortly after, via stage 2 — see addressSuggestion.
    location_name: extracted?.location_name ?? null,
    address: extracted?.address ?? null,
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
      end_time: event.end_time?.slice(0, 5) ?? '',
      all_day: event.all_day,
      location_name: event.location_name ?? '',
      // Same "don't clobber what's already there" rule as the live-form
      // suggestion (EventForm's addressSuggestion effect) — only apply a
      // found address if the posted event doesn't already have its own.
      address: event.address || (found.address ?? ''),
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

// Which half of the pipeline is showing, and how far each stage has gotten
// (feedback, 2026-08-23: "it should be pretty clear in the UI that there
// are two funnel stages... we should know when they're running and when
// they complete"). Rendered by PipelineStatus below, right under the pinned
// photo — 'skipped' means stage 2 was never applicable (stage 1 failed, or
// the poster already had a printed URL so no search was ever needed).
interface Pipeline {
  active: boolean
  stage1: 'running' | 'ok' | 'failed'
  stage2: 'skipped' | 'running' | 'found' | 'not_found'
}

function PipelineRow({ running, ok, runningLabel, doneLabel }: { running: boolean; ok: boolean; runningLabel: string; doneLabel: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1rem', fontWeight: 500, color: 'var(--ion-text-color)' }}>
      {running ? (
        <IonSpinner name="dots" style={{ width: 20, height: 20, flexShrink: 0 }} />
      ) : (
        <IonIcon
          icon={ok ? checkmarkCircle : closeCircleOutline}
          style={{ fontSize: 20, flexShrink: 0, color: ok ? 'var(--ion-color-success)' : 'var(--ion-color-medium)' }}
        />
      )}
      <span>{running ? runningLabel : doneLabel}</span>
    </div>
  )
}

// Sized and indented to read as part of the same content column as the
// fields below it, not a small aside easy to skim past — feedback,
// 2026-08-23: "make the pipeline details a bit bigger and put them in line
// with the rest of the text... fairly prominent so people don't
// accidentally start filling it out themselves [while it's still running]".
// 32px left padding matches an inset IonList's own item text start (16px
// list margin + 16px item padding-start), confirmed by direct measurement
// against a real rendered ion-item rather than assumed.
function PipelineStatus({ pipeline }: { pipeline: Pipeline }) {
  if (!pipeline.active) return null
  return (
    <div style={{ padding: '16px 32px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PipelineRow
        running={pipeline.stage1 === 'running'}
        ok={pipeline.stage1 === 'ok'}
        runningLabel="Reading photo…"
        doneLabel={pipeline.stage1 === 'ok' ? 'Read details from photo' : "Couldn't read the photo"}
      />
      {pipeline.stage2 !== 'skipped' && (
        <PipelineRow
          running={pipeline.stage2 === 'running'}
          ok={pipeline.stage2 === 'found'}
          runningLabel="Searching online…"
          doneLabel={pipeline.stage2 === 'found' ? 'Found more details online' : 'No additional details found online'}
        />
      )}
    </div>
  )
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
// the source in afterward rather than blocking submission on it; (4) the
// form itself (not a separate blank "processing" screen) shows the instant
// a photo is picked, so the fields are visibly what's being populated, with
// the photo pinned at the top of the screen throughout.
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
  const [stage, setStage] = useState<'choice' | 'form'>('choice')
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [choiceError, setChoiceError] = useState<string | null>(null)
  const [initialValues, setInitialValues] = useState<EventFormInitialValues | null>(null)
  const [formNote, setFormNote] = useState<string | null>(null)
  const [sourceUrlSuggestion, setSourceUrlSuggestion] = useState<string | null>(null)
  const [addressSuggestion, setAddressSuggestion] = useState<string | null>(null)
  const [pipeline, setPipeline] = useState<Pipeline>({ active: false, stage1: 'running', stage2: 'skipped' })

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
    setAddressSuggestion(null)
    setPipeline({ active: false, stage1: 'running', stage2: 'skipped' })
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
    setPipeline((prev) => ({ ...prev, stage2: 'running' }))
    findEventSource({ title: fields.title, location_name: fields.location_name, address: fields.address })
      .then((found) => {
        if (activeSessionRef.current === session) setPipeline((prev) => ({ ...prev, stage2: found ? 'found' : 'not_found' }))
        if (!found) return

        session.sourceUrlSuggestion = found.source_url
        session.sourceName = found.source_name

        if (session.createdEvent) {
          // Already posted by the time this resolved — only patch in
          // whichever fields the created event doesn't already have its
          // own value for (the member's own, or one already applied to
          // the still-open form before they submitted).
          const needsSourceUrl = !session.createdEvent.source_url
          const needsAddress = !session.createdEvent.address && !!found.address
          if (needsSourceUrl || needsAddress) void patchDiscoveredSource(session.createdEvent, found)
          return
        }
        if (session.cancelled) return
        // Still on the form for this exact attempt — reflect it live.
        // EventForm itself only applies each suggestion if its own target
        // field is still empty (see that component's own comment).
        if (activeSessionRef.current === session) {
          setSourceUrlSuggestion(found.source_url)
          if (found.address) setAddressSuggestion(found.address)
        }
      })
      .catch(() => {
        if (activeSessionRef.current === session) setPipeline((prev) => ({ ...prev, stage2: 'not_found' }))
      })
  }

  async function handleFile(file: File) {
    // A fresh session per attempt — see PhotoSession's own comment on why
    // this can't be a flat set of refs shared across attempts.
    const session: PhotoSession = { cancelled: false, createdEvent: null, sourceUrlSuggestion: null, sourceName: null }
    activeSessionRef.current = session

    // Show the real form immediately — even before the photo finishes
    // uploading or stage 1 resolves — so the field labels are visible right
    // away (feedback, 2026-08-23: "even at this stage, I should see the
    // fields... it should be obvious what the thing is trying to
    // populate"). The photo itself is pinned at the top the whole time.
    const previewUrl = URL.createObjectURL(file)
    setPhotoPreviewUrl(previewUrl)
    setChoiceError(null)
    setInitialValues(null)
    setFormNote(null)
    setSourceUrlSuggestion(null)
    setAddressSuggestion(null)
    setPipeline({ active: true, stage1: 'running', stage2: 'skipped' })
    setStage('form')

    let image: UploadedImage
    try {
      image = await uploadImage(file, 'events')
    } catch {
      if (session.cancelled) return
      setPipeline({ active: false, stage1: 'running', stage2: 'skipped' })
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

    setInitialValues(toInitialValues(fields, image))
    setFormNote(fields ? null : "Couldn't read the details from that photo — it's attached below, fill in the rest yourself.")
    setPipeline((prev) => ({ ...prev, stage1: fields ? 'ok' : 'failed' }))

    // Stage 2, in the background — only worth it if stage 1 succeeded and
    // didn't already find everything it's responsible for: a URL printed
    // on the poster, and a real street address (a poster naming a
    // well-known venue often has no address printed at all).
    if (fields && (!fields.source_url || !fields.address)) {
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '70vh',
              padding: '32px 24px',
              textAlign: 'center',
            }}
          >
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
            <IonButton expand="block" style={{ width: '100%', maxWidth: 320 }} onClick={() => fileInputRef.current?.click()}>
              <IonIcon slot="start" icon={cameraOutline} />
              Add from Photo
            </IonButton>
            {choiceError && (
              <IonText color="danger">
                <p style={{ fontSize: '0.8125rem', margin: '12px 0 0', maxWidth: 280 }}>{choiceError}</p>
              </IonText>
            )}
            {/* One single button for the whole phrase (feedback, 2026-08-23,
                two rounds: first "or enter manually" wrapped onto two
                lines, then — once that was fixed by making it a flex row —
                "or" and "enter manually" still didn't share a baseline,
                since a plain <span> and a separate IonButton next to each
                other don't reliably line-up their text vertically even in
                a flex row). Putting the whole phrase inside one element
                guarantees one consistent baseline, since it's all the same
                text run — "or" just isn't underlined, so it still reads as
                plain lead-in text to "enter manually". */}
            <IonButton
              fill="clear"
              onClick={() => setStage('form')}
              style={{ ...unstyledButtonStyle, color: 'var(--ion-color-medium)', fontSize: '0.8125rem', marginTop: 16 }}
            >
              or <span style={{ textDecoration: 'underline', marginLeft: 4 }}>enter manually</span>
            </IonButton>
          </div>
        )}
        {stage === 'form' && (
          <>
            {photoPreviewUrl && (
              // Pinned at the top of the screen for the whole time the
              // member is reviewing/editing (feedback, 2026-08-23: "keep
              // the picture and view at the top of the screen") — sticky,
              // not just first-in-DOM, so it stays visible while scrolling
              // through the fields below. A solid background is required
              // for sticky content or text scrolling underneath would show
              // through.
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  background: 'var(--ion-background-color, #fff)',
                  padding: '12px 16px 0',
                  textAlign: 'center',
                }}
              >
                <img
                  src={photoPreviewUrl}
                  alt="Your photo"
                  style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.15)' }}
                />
              </div>
            )}
            <PipelineStatus pipeline={pipeline} />
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
              addressSuggestion={addressSuggestion}
              hidePhotoAttach={pipeline.active}
              onSubmit={handleSubmit}
              onCancel={handleDismiss}
            />
          </>
        )}
      </IonContent>
    </IonModal>
  )
}
