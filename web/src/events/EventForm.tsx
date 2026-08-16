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
import { useState } from 'react'

import { API_URL } from '../config'
import type { UploadedImage } from '../uploads/api'
import type { Event, EventInput } from './api'
import { EVENT_TOPIC_OPTIONS } from './topics'
import { useEventImageUpload } from './useEventImageUpload'

function toEventInput(image: UploadedImage | null, fields: Omit<EventInput, 'image_url' | 'thumbnail_url'>): EventInput {
  return { ...fields, image_url: image?.image_url ?? null, thumbnail_url: image?.thumbnail_url ?? null }
}

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
}: {
  initial?: Event
  submitLabel: string
  errorMessage: string
  onSubmit: (input: EventInput) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? '')
  const [allDay, setAllDay] = useState(initial?.all_day ?? false)
  const [startTime, setStartTime] = useState(initial?.start_time?.slice(0, 5) ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? '')
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { image, fileInputRef, uploading, attach, remove } = useEventImageUpload(
    initial?.image_url && initial?.thumbnail_url ? { image_url: initial.image_url, thumbnail_url: initial.thumbnail_url } : null,
  )

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
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{ border: 'none', font: 'inherit', width: '100%', padding: '8px 0', background: 'transparent' }}
        />
      </IonItem>
      <IonItem>
        <IonCheckbox checked={allDay} onIonChange={(e) => setAllDay(e.detail.checked)}>
          All day
        </IonCheckbox>
      </IonItem>
      {!allDay && (
        <IonItem>
          <IonLabel position="stacked">Time</IonLabel>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={{ border: 'none', font: 'inherit', width: '100%', padding: '8px 0', background: 'transparent' }}
          />
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
      <IonItem lines="none">
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
      {image && (
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
