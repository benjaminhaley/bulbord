import { IonButton, IonContent, IonHeader, IonIcon, IonModal, IonSpinner, IonText, IonTextarea, IonTitle, IonToolbar } from '@ionic/react'
import { cameraOutline, checkmarkCircle, chatbubbleEllipsesOutline, closeCircleOutline, closeOutline } from 'ionicons/icons'
import { useRef, useState } from 'react'

import { API_URL } from '../config'
import { unstyledButtonStyle } from '../theme/layout'
import type { UploadedImage } from '../uploads/api'
import { uploadImage } from '../uploads/api'
import {
  createEvent,
  extractEventFieldsFromDescription,
  extractEventFieldsFromPhoto,
  findEventDetailsFromDescription,
  findEventImage,
  findEventSource,
  updateEvent,
  type DiscoveredEventDetails,
  type Event,
  type EventInput,
  type ExtractedEventFields,
} from './api'
import { EventForm, type EventFieldSuggestions, type EventFormInitialValues } from './EventForm'

function toInitialValues(extracted: ExtractedEventFields | null, image: UploadedImage | null): EventFormInitialValues {
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
    // own event until now. A real address the poster didn't print (or the
    // description didn't state) may still arrive shortly after, via stage
    // 2 — see EventForm's fieldSuggestions prop.
    location_name: extracted?.location_name ?? null,
    address: extracted?.address ?? null,
    // Found either directly in stage 1 (free — printed on the poster, or
    // literally typed in the description) or via the background stage-2
    // live search — see EventForm's fieldSuggestions prop for how a
    // stage-2 result reaches an already-open form.
    source_url: extracted?.source_url ?? null,
    topic: extracted?.topic ?? null,
    image_url: image?.image_url ?? null,
    thumbnail_url: image?.thumbnail_url ?? null,
  }
}

// What's pinned at the top of the review form, for as long as the member is
// looking at it — a photo preview (feedback #93) or the description they
// typed (feedback #133). A single discriminated field rather than a
// separate `mode` flag plus one nullable value per input type, so there's
// no way for those to fall out of sync with each other.
type PinnedInput = { kind: 'photo'; previewUrl: string } | { kind: 'description'; text: string }

// One attempt's worth of mutable state that the stage-2 background search
// needs to keep reading/writing after it resolves — which can happen well
// after this component has re-rendered onto a different attempt, or closed
// entirely. A fresh object per attempt (not a flat set of refs) so a
// late-resolving OLD attempt's search can never cross-contaminate a NEWER
// attempt's state — see handlePhoto/handleDescription's own comments.
// Shared by both the photo flow (feedback #93) and the description flow
// (feedback #133) — the two differ in how they populate `discovered`
// (findEventSource's narrow url/name/address vs.
// findEventDetailsFromDescription's much broader field set), not in how
// the session itself is tracked or patched back onto an already-created
// event.
interface ExtractionSession {
  cancelled: boolean
  createdEvent: Event | null
  discovered: DiscoveredEventDetails | null
}

// Every field a stage-2 search might contribute that's also a real column
// on Event — the set hasSomethingToAdd checks before bothering to patch an
// already-created event.
const DISCOVERABLE_FIELDS = [
  'source_url',
  'address',
  'start_date',
  'start_time',
  'location_name',
  'topic',
  'description',
] as const satisfies readonly (keyof DiscoveredEventDetails & keyof Event)[]

// True if `found` carries any field the already-created `event` doesn't
// already have its own value for — the general condition under which a
// late-resolving stage 2 is worth patching in at all.
function hasSomethingToAdd(event: Event, found: DiscoveredEventDetails): boolean {
  return DISCOVERABLE_FIELDS.some((field) => !!found[field] && !event[field])
}

async function patchDiscoveredDetails(event: Event, found: DiscoveredEventDetails): Promise<void> {
  try {
    const startTime = event.start_time?.slice(0, 5) || found.start_time || ''
    await updateEvent(event.id, {
      title: event.title || found.title || '',
      description: event.description ?? found.description ?? '',
      start_date: event.start_date || found.start_date || '',
      start_time: startTime,
      end_time: event.end_time?.slice(0, 5) || found.end_time || '',
      // A newly-arrived real start_time means this can no longer be an
      // all-day event, even if it was created as one for lack of anything
      // better — same "a stated time wins" rule EventForm's own
      // fieldSuggestions effect applies live.
      all_day: startTime ? false : event.all_day,
      location_name: event.location_name || found.location_name || '',
      address: event.address || (found.address ?? ''),
      source_url: event.source_url || found.source_url || '',
      image_url: event.image_url,
      thumbnail_url: event.thumbnail_url,
      topic: event.topic || found.topic || '',
      source_name: found.source_name,
    })
  } catch {
    // Best-effort, silent — a failed background patch just means whatever
    // stage 2 found never got attached; the event itself already posted
    // successfully and nothing else depends on this succeeding.
  }
}

// DiscoveredEventDetails minus source_name (a create-time-only field, never
// shown/edited in the form) is exactly EventForm's fieldSuggestions shape.
function toFieldSuggestions({ source_name: _sourceName, ...suggestions }: DiscoveredEventDetails): EventFieldSuggestions {
  return suggestions
}

// Which half (or third) of the pipeline is showing, and how far each stage
// has gotten (feedback, 2026-08-23: "it should be pretty clear in the UI
// that there are two funnel stages... we should know when they're running
// and when they complete"). Rendered by PipelineStatus below, right under
// the pinned photo/description, for both the photo flow and the
// description flow — 'skipped' means a stage was never applicable (photo
// flow: stage 2 only runs if stage 1 didn't already find a URL/address,
// and stage 3 never runs at all, since the attached photo itself already
// is the event's image; the description flow's stage 2 always runs — see
// handleDescription's own comment — and stage 3, a real photo search, is
// unique to that flow, feedback #133, 2026-09-05: "make sure it's
// indicated [as its own step]... or make sure it actually pulls in the
// picture").
interface Pipeline {
  active: boolean
  stage1: 'running' | 'ok' | 'failed'
  stage2: 'skipped' | 'running' | 'found' | 'not_found'
  stage3: 'skipped' | 'running' | 'found' | 'not_found'
}

const PIPELINE_IDLE: Pipeline = { active: false, stage1: 'running', stage2: 'skipped', stage3: 'skipped' }

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
function PipelineStatus({ pipeline, mode }: { pipeline: Pipeline; mode: PinnedInput['kind'] }) {
  if (!pipeline.active) return null
  return (
    <div style={{ padding: '16px 32px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PipelineRow
        running={pipeline.stage1 === 'running'}
        ok={pipeline.stage1 === 'ok'}
        runningLabel={mode === 'photo' ? 'Reading photo…' : 'Reading description…'}
        doneLabel={
          pipeline.stage1 === 'ok'
            ? mode === 'photo'
              ? 'Read details from photo'
              : 'Read details from description'
            : mode === 'photo'
              ? "Couldn't read the photo"
              : "Couldn't find enough in that description"
        }
      />
      {pipeline.stage2 !== 'skipped' && (
        <PipelineRow
          running={pipeline.stage2 === 'running'}
          ok={pipeline.stage2 === 'found'}
          runningLabel="Searching online…"
          doneLabel={pipeline.stage2 === 'found' ? 'Found more details online' : 'No additional details found online'}
        />
      )}
      {pipeline.stage3 !== 'skipped' && (
        <PipelineRow
          running={pipeline.stage3 === 'running'}
          ok={pipeline.stage3 === 'found'}
          runningLabel="Finding a photo…"
          doneLabel={pipeline.stage3 === 'found' ? 'Found a photo' : "Couldn't find a photo — we'll keep looking after you post"}
        />
      )}
    </div>
  )
}

// Feedback #93 ("take a picture of a poster... have everything auto
// populate") and feedback #133 ("if I don't wanna enter a picture, my
// other option should be to describe the event in words... look up the
// details based on that description using a similar pipeline just like in
// the photo system") — two on-ramps into the same review-before-post flow.
// Restyled/re-architected 2026-08-23 for the photo flow, then extended
// 2026-09 for the description flow on top of the same architecture: (1) a
// full-screen modal, not inline content pushed above the events list; (2)
// Add from Photo leads as the primary, spacious choice, Describe It a
// secondary choice below it, manual entry a small subtitle link; (3) a
// real two-stage pipeline — a fast pass fills the form immediately, then a
// slower background web search runs while the member is already
// reviewing/editing, and keeps going even after Post is tapped, patching
// details in afterward rather than blocking submission on it; (4) the form
// itself (not a separate blank "processing" screen) shows the instant a
// photo is picked or a description is submitted, so the fields are visibly
// what's being populated, with the photo/description pinned at the top of
// the screen throughout.
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
  const [stage, setStage] = useState<'choice' | 'describe' | 'form'>('choice')
  const [pinned, setPinned] = useState<PinnedInput | null>(null)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [choiceError, setChoiceError] = useState<string | null>(null)
  const [initialValues, setInitialValues] = useState<EventFormInitialValues | null>(null)
  const [formNote, setFormNote] = useState<string | null>(null)
  const [fieldSuggestions, setFieldSuggestions] = useState<EventFieldSuggestions | null>(null)
  const [foundImage, setFoundImage] = useState<UploadedImage | null>(null)
  const [pipeline, setPipeline] = useState<Pipeline>(PIPELINE_IDLE)

  // Points at the most recent attempt's session for as long as it's the
  // one on screen — used only to guard live UI updates (setState calls)
  // against a stale/late resolution; never read by the session's own
  // closure below, which always captures its own `session` object directly.
  const activeSessionRef = useRef<ExtractionSession | null>(null)

  function resetVisibleState() {
    setStage('choice')
    setPinned((prev) => {
      if (prev?.kind === 'photo') URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    setDescriptionDraft('')
    setChoiceError(null)
    setInitialValues(null)
    setFormNote(null)
    setFieldSuggestions(null)
    setFoundImage(null)
    setPipeline(PIPELINE_IDLE)
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

  // Shared by both flows' background stage 2 — the only real difference
  // between them is which search produces the DiscoveredEventDetails (see
  // handlePhoto/handleDescription's own call sites), not how the result
  // gets applied once it resolves.
  function runStage2(session: ExtractionSession, search: Promise<DiscoveredEventDetails | null>) {
    setPipeline((prev) => ({ ...prev, stage2: 'running' }))
    search
      .then((found) => {
        if (activeSessionRef.current === session) setPipeline((prev) => ({ ...prev, stage2: found ? 'found' : 'not_found' }))
        if (!found) return

        session.discovered = found

        if (session.createdEvent) {
          // Already posted by the time this resolved — only patch in
          // whichever fields the created event doesn't already have its
          // own value for (the member's own, or one already applied to
          // the still-open form before they submitted).
          if (hasSomethingToAdd(session.createdEvent, found)) void patchDiscoveredDetails(session.createdEvent, found)
          return
        }
        if (session.cancelled) return
        // Still on the form for this exact attempt — reflect it live.
        // EventForm itself only applies each suggestion if its own target
        // field is still empty (see that component's own comment).
        if (activeSessionRef.current === session) setFieldSuggestions(toFieldSuggestions(found))
      })
      .catch(() => {
        if (activeSessionRef.current === session) setPipeline((prev) => ({ ...prev, stage2: 'not_found' }))
      })
  }

  async function handlePhoto(file: File) {
    // A fresh session per attempt — see ExtractionSession's own comment on
    // why this can't be a flat set of refs shared across attempts.
    const session: ExtractionSession = { cancelled: false, createdEvent: null, discovered: null }
    activeSessionRef.current = session

    // Show the real form immediately — even before the photo finishes
    // uploading or stage 1 resolves — so the field labels are visible right
    // away (feedback, 2026-08-23: "even at this stage, I should see the
    // fields... it should be obvious what the thing is trying to
    // populate"). The photo itself is pinned at the top the whole time.
    setPinned({ kind: 'photo', previewUrl: URL.createObjectURL(file) })
    setChoiceError(null)
    setInitialValues(null)
    setFormNote(null)
    setFieldSuggestions(null)
    setFoundImage(null)
    setPipeline({ active: true, stage1: 'running', stage2: 'skipped', stage3: 'skipped' })
    setStage('form')

    let image: UploadedImage
    try {
      image = await uploadImage(file, 'events')
    } catch {
      if (session.cancelled) return
      setPipeline(PIPELINE_IDLE)
      setPinned((prev) => {
        if (prev?.kind === 'photo') URL.revokeObjectURL(prev.previewUrl)
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
      const { title, location_name, address } = fields
      runStage2(
        session,
        findEventSource({ title, location_name, address }).then((found) =>
          found ? { source_url: found.source_url, source_name: found.source_name, address: found.address } : null,
        ),
      )
    }
  }

  async function handleDescription(description: string) {
    const session: ExtractionSession = { cancelled: false, createdEvent: null, discovered: null }
    activeSessionRef.current = session

    // Same "show the real form immediately" posture as the photo flow —
    // the description itself is pinned at the top the whole time, in place
    // of a photo.
    setPinned({ kind: 'description', text: description })
    setChoiceError(null)
    setInitialValues(null)
    setFormNote(null)
    setFieldSuggestions(null)
    setFoundImage(null)
    setPipeline({ active: true, stage1: 'running', stage2: 'running', stage3: 'skipped' })
    setStage('form')

    // Stage 2 always runs for this flow (see findEventDetailsFromDescription's
    // own comment) and doesn't need stage 1's result to start — it's given
    // the raw description directly and treats any hint as optional — so the
    // two stages fire concurrently rather than stage 2 waiting on stage 1's
    // (often several-second) round trip first. searchPromise is consumed
    // twice below: once by runStage2 (applies field suggestions / patches
    // an already-posted event) and once directly here (to feed stage 3 the
    // richest fields available) — a promise can be awaited/then'd more than
    // once, each getting the same resolved value, so this doesn't re-run
    // the search.
    const searchPromise = findEventDetailsFromDescription(description, {})
    runStage2(session, searchPromise)

    let fields: ExtractedEventFields | null = null
    try {
      fields = await extractEventFieldsFromDescription(description)
    } catch {
      fields = null
    }
    if (session.cancelled) return

    setInitialValues(fields ? toInitialValues(fields, null) : null)
    setFormNote(
      fields
        ? null
        : "Couldn't tell enough about the event from that description — fill in what you can below, we're still searching online for the rest.",
    )
    setPipeline((prev) => ({ ...prev, stage1: fields ? 'ok' : 'failed' }))

    // Stage 3: a real photo search (feedback #133, 2026-09-05 — a
    // description-flow post has no photo of its own the way an attached
    // poster photo does, and "the pipeline found more details" shouldn't
    // silently mean "and also either found or didn't find a photo, with no
    // indication either way"). Waits for stage 2 so it can search with the
    // richest fields available — a discovered source_url in particular is
    // the single most useful signal for finding a real, on-topic photo,
    // same as a sourced/scraped event's own image-enrichment pass already
    // gets. Doesn't block Post: if the member submits before this
    // resolves, POST /events' own background image search (same
    // enrichEventImage pipeline) is the fallback safety net.
    setPipeline((prev) => ({ ...prev, stage3: 'running' }))
    const found = await searchPromise.catch(() => null)
    if (session.cancelled || session.createdEvent) return
    const bestTitle = found?.title ?? fields?.title ?? description
    const bestDescription = found?.description ?? fields?.description ?? null
    const bestSourceUrl = found?.source_url ?? fields?.source_url ?? null

    let image: UploadedImage | null = null
    try {
      image = await findEventImage({ source_url: bestSourceUrl, title: bestTitle, description: bestDescription })
    } catch {
      image = null
    }
    // Re-checked after the second await: the member may have already
    // tapped Post while this was searching — in that case, leave the
    // already-created event alone and let its own background enrichment
    // (triggered server-side since no image was in the POST body) handle
    // it, rather than racing a second, independent image search against
    // the same row.
    if (session.cancelled || session.createdEvent) return
    if (activeSessionRef.current === session) {
      setPipeline((prev) => ({ ...prev, stage3: image ? 'found' : 'not_found' }))
      if (image) setFoundImage(image)
    }
  }

  async function handleSubmit(input: EventInput) {
    const session = activeSessionRef.current
    const sourceName =
      session && input.source_url && input.source_url === session.discovered?.source_url ? (session.discovered?.source_name ?? undefined) : undefined
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
                if (file) void handlePhoto(file)
                e.target.value = ''
              }}
            />
            <IonButton expand="block" style={{ width: '100%', maxWidth: 320 }} onClick={() => fileInputRef.current?.click()}>
              <IonIcon slot="start" icon={cameraOutline} />
              Add from Photo
            </IonButton>
            {/* Feedback #133: "if I don't wanna enter a picture, my other
                option should be to describe the event in words". A second,
                secondary-weight choice right below the primary photo
                button — not buried behind "enter manually", since it still
                runs the same auto-populate pipeline, just from text
                instead of a photo. */}
            <IonButton
              expand="block"
              fill="outline"
              style={{ width: '100%', maxWidth: 320, marginTop: 12 }}
              onClick={() => {
                setDescriptionDraft('')
                setChoiceError(null)
                setStage('describe')
              }}
            >
              <IonIcon slot="start" icon={chatbubbleEllipsesOutline} />
              Describe It
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
        {stage === 'describe' && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '70vh', padding: '32px 24px' }}>
            <IonIcon
              icon={chatbubbleEllipsesOutline}
              style={{ fontSize: 40, color: 'var(--ion-color-primary)', marginBottom: 12, alignSelf: 'center' }}
            />
            <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem', textAlign: 'center' }}>Describe the Event</h2>
            <p style={{ color: 'var(--ion-color-medium)', margin: '0 0 20px', textAlign: 'center' }}>
              Tell us what you know — a name, a place, roughly when — and we'll try to find and fill in the rest.
            </p>
            <IonTextarea
              value={descriptionDraft}
              onIonInput={(e) => setDescriptionDraft(e.detail.value ?? '')}
              autoGrow
              autofocus
              placeholder="e.g. “Fall Festival at Nettelhorst Park this Saturday morning”"
              style={{ border: '1px solid var(--ion-color-step-200, #ccc)', borderRadius: 10, padding: '10px 12px', minHeight: 100 }}
            />
            <IonButton
              expand="block"
              style={{ marginTop: 20 }}
              disabled={!descriptionDraft.trim()}
              onClick={() => void handleDescription(descriptionDraft.trim())}
            >
              Look It Up
            </IonButton>
            <IonButton
              fill="clear"
              color="medium"
              style={{ marginTop: 8 }}
              onClick={() => {
                setChoiceError(null)
                setStage('choice')
              }}
            >
              Back
            </IonButton>
          </div>
        )}
        {stage === 'form' && (
          <>
            {pinned && (
              // Pinned at the top of the screen for the whole time the
              // member is reviewing/editing (feedback, 2026-08-23: "keep
              // the picture and view at the top of the screen") — sticky,
              // not just first-in-DOM, so it stays visible while scrolling
              // through the fields below. PipelineStatus lives inside this
              // SAME sticky element (feedback, 2026-09-05: "the pipeline
              // is still running [indicator] should remain on top and
              // should not scroll out of view") — it used to be a
              // separate, non-sticky element right after this one, which
              // meant it scrolled away independently the moment the
              // member scrolled the form beneath it. A solid background is
              // required for sticky content or text scrolling underneath
              // would show through.
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  background: 'var(--ion-background-color, #fff)',
                }}
              >
                {pinned.kind === 'photo' && (
                  <div style={{ padding: '12px 16px 0', textAlign: 'center' }}>
                    <img
                      src={pinned.previewUrl}
                      alt="Your photo"
                      style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.15)' }}
                    />
                  </div>
                )}
                {pinned.kind === 'description' && (
                  <div style={{ padding: '12px 16px 0' }}>
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: 'var(--ion-color-light, #f4f4f4)',
                        fontStyle: 'italic',
                        color: 'var(--ion-text-color)',
                      }}
                    >
                      “{pinned.text}”
                    </div>
                  </div>
                )}
                <PipelineStatus pipeline={pipeline} mode={pinned.kind} />
              </div>
            )}
            {/* The real photo stage 3 found (or, while still searching, a
                placeholder reserving its spot) — deliberately NOT inside the
                sticky block above (feedback, 2026-09-05: "the photo should
                appear above the title, as part of the post, not above the
                checkmarks — it should be scrollable"). The pinned quote and
                pipeline checkmarks are reference/status info worth keeping
                on screen the whole time; this is the event's actual
                picture, so it belongs in the ordinary scrollable body,
                right above the fields it's the photo *for* — not stuck
                fighting for space with an always-visible status readout.
                Shown large, not as the small 60x60 attach-preview
                EventForm's own photo section uses elsewhere ("it shouldn't
                appear just as a small attachment... what you see is what
                you get"). */}
            {pinned?.kind === 'description' && (pipeline.stage3 === 'running' || foundImage) && (
              <div style={{ padding: '12px 16px 0', textAlign: 'center' }}>
                {foundImage ? (
                  <img
                    src={`${API_URL}${foundImage.image_url}`}
                    alt="Photo found for this event"
                    style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.15)' }}
                  />
                ) : (
                  <div
                    style={{
                      maxWidth: '100%',
                      height: 160,
                      borderRadius: 10,
                      background: 'var(--ion-color-light, #f4f4f4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IonSpinner name="dots" />
                  </div>
                )}
              </div>
            )}
            {formNote && (
              <IonText color="medium">
                <p style={{ fontSize: '0.8125rem', margin: '12px 16px 8px' }}>{formNote}</p>
              </IonText>
            )}
            <EventForm
              key={initialValues ? `${pinned?.kind ?? 'manual'}-prefill` : 'blank'}
              initial={initialValues ?? undefined}
              submitLabel="Post"
              errorMessage="Could not post this event"
              fieldSuggestions={fieldSuggestions}
              imageSuggestion={foundImage}
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
