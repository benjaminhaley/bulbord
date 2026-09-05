import {
  IonButton,
  IonCheckbox,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
} from '@ionic/react'
import { closeOutline, imageOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { API_URL } from '../config'
import type { UploadedImage } from '../uploads/api'
import type { Event, EventInput } from './api'
import { EVENT_TOPIC_OPTIONS } from './topics'
import { useEventImageUpload } from './useEventImageUpload'

function toEventInput(image: UploadedImage | null, fields: Omit<EventInput, 'image_url' | 'thumbnail_url'>): EventInput {
  return { ...fields, image_url: image?.image_url ?? null, thumbnail_url: image?.thumbnail_url ?? null }
}

// Exported (not just a local closure) so it's directly unit-testable —
// feedback, 2026-08-23: "it should definitely tell me why [Post is
// disabled]... there should be a path to remediate."
export function describeMissingFields(fields: string[]): string {
  if (fields.length === 1) return `${fields[0]} is required to post.`
  return `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]} are required to post.`
}

// Local to this form rather than reusing auth/profileForm.tsx's identical
// component — a tiny UI atom, not worth a cross-feature import for.
function RequiredMark() {
  return (
    <span aria-hidden="true" style={{ color: 'var(--ion-color-danger)' }}>
      {' '}
      *
    </span>
  )
}

// Native date/time inputs' own intrinsic width, not stretched — a plain
// `width: '100%'` (the original style here) let iOS Safari center the
// displayed value inside a wide box, reading as a big, oddly-empty row next
// to every other field's compact, left-started text (feedback, 2026-08-23:
// "the date and time layout here is kind of ugly... still full width").
const dateTimeInputStyle = { border: 'none', font: 'inherit', padding: '8px 0', background: 'transparent', textAlign: 'left' as const }

// Just the subset of Event this form actually reads to prefill itself — an
// Event satisfies this structurally (editing reuses it directly), but so
// does a plain candidate object with no id/interest/etc., which is what
// AddEventModal.tsx hands in after extraction (feedback #93).
export type EventFormInitialValues = Pick<
  Event,
  | 'title'
  | 'description'
  | 'start_date'
  | 'all_day'
  | 'start_time'
  | 'end_time'
  | 'location_name'
  | 'address'
  | 'source_url'
  | 'topic'
  | 'image_url'
  | 'thumbnail_url'
>

// Shared by the "new event" and "edit event" flows (feedback #46) — same
// shape as feedback/FeedbackForm's shared new/edit component. Only
// title, location (address), and start_date are required; everything else
// (description, time, all-day, source url, photo) is optional.
// A background extraction stage's late-arriving result (feedback,
// 2026-08-23: "as a user I should be able to edit or accept the results
// during this entire process") — arrives well after mount, once a stage-2
// web search finds something, so it's threaded through as a prop rather
// than baked into `initial` (which only ever applies once, at mount). Every
// field is optional and applied independently: only to a field that's
// still empty when the suggestion arrives — a member's own edit (typed or
// accepted-then-changed) always wins over a late suggestion. Originally two
// narrow props (sourceUrlSuggestion/addressSuggestion, photo-extraction's
// own stage 2) — generalized (feedback #133) once the description-based
// flow's own stage 2 needed to suggest nearly every field, not just those
// two, so both flows now share one mechanism instead of drifting into two.
// Stage-running/complete status is shown by AddEventModal.tsx's own
// pipeline indicator, not here.
export interface EventFieldSuggestions {
  title?: string
  description?: string
  start_date?: string
  start_time?: string
  end_time?: string
  location_name?: string
  address?: string
  source_url?: string
  topic?: string
}

export function EventForm({
  initial,
  submitLabel,
  errorMessage,
  onSubmit,
  onCancel,
  fieldSuggestions,
  imageSuggestion,
  hidePhotoAttach,
}: {
  initial?: EventFormInitialValues
  submitLabel: string
  errorMessage: string
  onSubmit: (input: EventInput) => Promise<void>
  onCancel: () => void
  fieldSuggestions?: EventFieldSuggestions | null
  // Same late-arriving-suggestion mechanism as fieldSuggestions above, but
  // for a real photo the description flow's own stage 3 found (feedback
  // #133, 2026-09-05) — a separate prop rather than folded into
  // EventFieldSuggestions since an image is a genuinely different shape
  // (an UploadedImage object tied to useEventImageUpload's own state, not
  // a plain string an IonInput owns). Only applied if the member hasn't
  // already attached their own photo.
  imageSuggestion?: UploadedImage | null
  // True when the caller (AddEventModal.tsx) already shows the attached
  // photo prominently pinned at the top of the screen — avoids showing the
  // same photo a second time via this form's own attach/thumbnail section.
  hidePhotoAttach?: boolean
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? '')
  const [allDay, setAllDay] = useState(initial?.all_day ?? false)
  const [startTime, setStartTime] = useState(initial?.start_time?.slice(0, 5) ?? '')
  const [endTime, setEndTime] = useState(initial?.end_time?.slice(0, 5) ?? '')
  const [locationName, setLocationName] = useState(initial?.location_name ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? '')
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { image, fileInputRef, uploading, attach, remove, setImage } = useEventImageUpload(
    initial?.image_url && initial?.thumbnail_url ? { image_url: initial.image_url, thumbnail_url: initial.thumbnail_url } : null,
  )

  useEffect(() => {
    if (imageSuggestion && !image) setImage(imageSuggestion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSuggestion])

  useEffect(() => {
    if (!fieldSuggestions) return
    const s = fieldSuggestions
    // Apply each suggested field only if its own form field is still
    // empty — a member's own edit (typed or accepted-then-changed) always
    // wins over a late suggestion.
    const applyIfEmpty = (setter: (v: string) => void, current: string, suggested: string | undefined) => {
      if (suggested && !current.trim()) setter(suggested)
    }
    applyIfEmpty(setTitle, title, s.title)
    applyIfEmpty(setDescription, description, s.description)
    applyIfEmpty(setStartDate, startDate, s.start_date)
    applyIfEmpty(setEndTime, endTime, s.end_time)
    applyIfEmpty(setLocationName, locationName, s.location_name)
    applyIfEmpty(setAddress, address, s.address)
    applyIfEmpty(setSourceUrl, sourceUrl, s.source_url)
    applyIfEmpty(setTopic, topic, s.topic)
    // A suggested start_time also turns off All day when applied — the
    // time fields are hidden while allDay is true (see below), so
    // suggesting a real time and leaving allDay untouched would silently
    // fill in a field the member can't even see.
    if (s.start_time && !startTime.trim()) {
      setStartTime(s.start_time)
      setAllDay(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldSuggestions])

  // Named, not just enforced silently — a disabled Post with no explanation
  // left a member stuck with no path to remediate (feedback, 2026-08-23:
  // "I can't post here, but it's not giving me feedback why not... there
  // should be a path to remediate"). This came up specifically via the photo
  // pipeline: a poster can name a well-known venue with no printed street
  // address, and if the stage-2 source search also doesn't find one (it can
  // fail, same as stage 1), Address is left blank with nothing telling the
  // member that's the one thing stopping them from posting.
  const missingFields = [
    !title.trim() && 'Title',
    !address.trim() && 'Address',
    !startDate && 'Date',
  ].filter((v): v is string => !!v)
  const canSubmit = missingFields.length === 0


  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(
        toEventInput(image, {
          title: title.trim(),
          description: description.trim(),
          start_date: startDate,
          start_time: allDay ? '' : startTime,
          end_time: allDay ? '' : endTime,
          all_day: allDay,
          location_name: locationName.trim(),
          address: address.trim(),
          source_url: sourceUrl.trim(),
          topic,
        }),
      )
    } catch {
      setError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <IonList inset>
      <IonItem>
        <IonLabel position="stacked">
          Title
          <RequiredMark />
        </IonLabel>
        <IonInput value={title} onIonInput={(e) => setTitle(e.detail.value ?? '')} autofocus />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Description</IonLabel>
        <IonTextarea value={description} onIonInput={(e) => setDescription(e.detail.value ?? '')} autoGrow />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">
          Date
          <RequiredMark />
        </IonLabel>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={dateTimeInputStyle} />
      </IonItem>
      <IonItem>
        <IonCheckbox checked={allDay} onIonChange={(e) => setAllDay(e.detail.checked)}>
          All day
        </IonCheckbox>
      </IonItem>
      {!allDay && (
        <IonItem>
          <IonLabel position="stacked">Start Time</IonLabel>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={dateTimeInputStyle} />
        </IonItem>
      )}
      {!allDay && (
        <IonItem>
          <IonLabel position="stacked">End Time</IonLabel>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={dateTimeInputStyle} />
        </IonItem>
      )}
      {/* Split into two fields (feedback, 2026-08-23: "make sure the
          location has both a location name and a location address... the
          name is the quick interpretable name that anyone can understand,
          and the address is a specific thing that Google Maps would
          always get right") — the underlying data model already had both
          (system-sourced events have always carried location_name
          separately from address, see CLAUDE.md's Events data model), this
          form just never exposed the split to a member posting their own
          event. Location Name stays optional (a plain street address is a
          complete, postable location on its own); Address remains the one
          required location field, matching the existing schema/API
          contract. */}
      <IonItem>
        <IonLabel position="stacked">Location Name</IonLabel>
        <IonInput
          value={locationName}
          onIonInput={(e) => setLocationName(e.detail.value ?? '')}
          placeholder="Short, recognizable name, e.g. Hawthorne School"
        />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">
          Address
          <RequiredMark />
        </IonLabel>
        <IonInput value={address} onIonInput={(e) => setAddress(e.detail.value ?? '')} placeholder="Street address" />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Source URL</IonLabel>
        <IonInput
          type="url"
          value={sourceUrl}
          onIonInput={(e) => setSourceUrl(e.detail.value ?? '')}
          placeholder="Optional link with more details"
        />
      </IonItem>
      {/* Optional (feedback #97) — powers the Events tab's topic filter. */}
      <IonItem>
        <IonLabel position="stacked">Topic</IonLabel>
        <IonSelect value={topic} onIonChange={(e) => setTopic(e.detail.value ?? '')} placeholder="Optional">
          <IonSelectOption value="">None</IonSelectOption>
          {EVENT_TOPIC_OPTIONS.map((option) => (
            <IonSelectOption key={option} value={option}>
              {option}
            </IonSelectOption>
          ))}
        </IonSelect>
      </IonItem>
      {!hidePhotoAttach && (
        <IonItem lines="none">
          {/* ionic-exception: Ionic has no file-picker component; a hidden
              native file input triggered by a real button is the standard
              pattern (see the IonButton below). */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void attach(file)
              e.target.value = ''
            }}
          />
          <IonButton fill="clear" onClick={() => fileInputRef.current?.click()}>
            <IonIcon slot="icon-only" icon={imageOutline} />
          </IonButton>
          {uploading && <IonSpinner name="dots" />}
        </IonItem>
      )}
      {!hidePhotoAttach && image && (
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ position: 'relative', width: 60 }}>
            <img
              src={`${API_URL}${image.thumbnail_url}`}
              alt=""
              style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }}
            />
            <IonButton
              fill="clear"
              size="small"
              style={{ position: 'absolute', top: -14, right: -14, '--padding-start': '4px', '--padding-end': '4px' }}
              onClick={remove}
            >
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </div>
        </div>
      )}
      {error && (
        <IonText color="danger">
          <p className="ion-padding-start">{error}</p>
        </IonText>
      )}
      <IonItem lines="none">
        <IonButton fill="outline" disabled={submitting || uploading || !canSubmit} onClick={submit}>
          {submitLabel}
        </IonButton>
        <IonButton fill="clear" color="medium" disabled={submitting} onClick={onCancel}>
          Cancel
        </IonButton>
      </IonItem>
      {!canSubmit && (
        <IonText color="medium">
          <p className="ion-padding-start" style={{ fontSize: '0.8125rem', marginTop: -4 }}>
            {describeMissingFields(missingFields)}
          </p>
        </IonText>
      )}
    </IonList>
  )
}
