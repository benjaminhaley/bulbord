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
export function EventForm({
  initial,
  submitLabel,
  errorMessage,
  onSubmit,
  onCancel,
  sourceUrlSuggestion,
  hidePhotoAttach,
}: {
  initial?: EventFormInitialValues
  submitLabel: string
  errorMessage: string
  onSubmit: (input: EventInput) => Promise<void>
  onCancel: () => void
  // Photo-extraction's background stage-2 (feedback, 2026-08-23: "as a user
  // I should be able to edit or accept the results during this entire
  // process") — arrives well after mount, once a live web search for the
  // event's source finds something, so it's threaded through as a prop
  // rather than baked into `initial` (which only ever applies once, at
  // mount). Only ever applied if the Source URL field is still empty when
  // it arrives — a member's own edit (typed or accepted-then-changed)
  // always wins over a late suggestion. Stage-running/complete status is
  // now shown by AddEventModal.tsx's own pipeline indicator, not here.
  sourceUrlSuggestion?: string | null
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
  const [address, setAddress] = useState(initial?.address ?? '')
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? '')
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { image, fileInputRef, uploading, attach, remove } = useEventImageUpload(
    initial?.image_url && initial?.thumbnail_url ? { image_url: initial.image_url, thumbnail_url: initial.thumbnail_url } : null,
  )

  useEffect(() => {
    setSourceUrl((current) => (sourceUrlSuggestion && !current.trim() ? sourceUrlSuggestion : current))
  }, [sourceUrlSuggestion])

  const canSubmit = title.trim() && address.trim() && startDate

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
        <IonLabel position="stacked">Title</IonLabel>
        <IonInput value={title} onIonInput={(e) => setTitle(e.detail.value ?? '')} autofocus />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Description</IonLabel>
        <IonTextarea value={description} onIonInput={(e) => setDescription(e.detail.value ?? '')} autoGrow />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Date</IonLabel>
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
      <IonItem>
        <IonLabel position="stacked">Location</IonLabel>
        <IonInput value={address} onIonInput={(e) => setAddress(e.detail.value ?? '')} placeholder="Address or place name" />
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
    </IonList>
  )
}
