import {
  IonButton,
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
import { fetchCampsByBreak, type BreakBucket, type Camp, type CampInput } from './api'
import { useCampImageUpload } from './useCampImageUpload'

const CUSTOM_DATE = 'custom'

function toCampInput(image: UploadedImage | null, fields: Omit<CampInput, 'image_url' | 'thumbnail_url'>): CampInput {
  return { ...fields, image_url: image?.image_url ?? null, thumbnail_url: image?.thumbnail_url ?? null }
}

// Shared by the start/end date <input>s below — IonInput doesn't support
// type="date", so these are plain inputs styled to match Ionic's field look.
const dateInputStyle = { border: 'none', font: 'inherit', width: '100%', padding: '8px 0', background: 'transparent' } as const

// Shared by the "new camp" and "edit camp" flows — own copy of events'
// EventForm.tsx shape. Only title, location (address), and start_date are
// required; end_date defaults to start_date server-side when left blank.
export function CampForm({
  initial,
  submitLabel,
  errorMessage,
  onSubmit,
  onCancel,
}: {
  initial?: Camp
  submitLabel: string
  errorMessage: string
  onSubmit: (input: CampInput) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? '')
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  // Every upcoming school-break/week bucket, offered as one-tap shortcuts to
  // fill in start/end date (feedback, 2026-08-04: picking a known school day
  // should be the easy path; a fully custom date must still be possible).
  // Fetched independently rather than passed as a prop so this works the
  // same whether the form is rendered from CampsPage (which already has
  // this data loaded) or CampDetailPage (which doesn't) — a handful of rows,
  // cheap to re-fetch.
  const [breakBuckets, setBreakBuckets] = useState<BreakBucket[]>([])
  const [selectedBucketId, setSelectedBucketId] = useState<string>(CUSTOM_DATE)

  useEffect(() => {
    fetchCampsByBreak()
      .then((buckets) => setBreakBuckets(buckets.filter((b) => b.id !== 'other')))
      .catch(() => setBreakBuckets([]))
  }, [])

  function selectBucket(bucketId: string) {
    setSelectedBucketId(bucketId)
    if (bucketId === CUSTOM_DATE) return
    const bucket = breakBuckets.find((b) => b.id === bucketId)
    if (!bucket) return
    setStartDate(bucket.start_date)
    setEndDate(bucket.end_date)
  }
  const [address, setAddress] = useState(initial?.address ?? '')
  const [pricePerDay, setPricePerDay] = useState(initial?.price_per_day ?? '')
  const [ageMin, setAgeMin] = useState(initial?.age_min != null ? String(initial.age_min) : '')
  const [ageMax, setAgeMax] = useState(initial?.age_max != null ? String(initial.age_max) : '')
  const [spotsAvailable, setSpotsAvailable] = useState(initial?.spots_available != null ? String(initial.spots_available) : '')
  const [bookingInstructions, setBookingInstructions] = useState(initial?.booking_instructions ?? '')
  const [prepInstructions, setPrepInstructions] = useState(initial?.prep_instructions ?? '')
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { image, fileInputRef, uploading, attach, remove } = useCampImageUpload(
    initial?.image_url && initial?.thumbnail_url ? { image_url: initial.image_url, thumbnail_url: initial.thumbnail_url } : null,
  )

  const canSubmit = title.trim() && address.trim() && startDate

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(
        toCampInput(image, {
          title: title.trim(),
          description: description.trim(),
          start_date: startDate,
          end_date: endDate.trim() || startDate,
          address: address.trim(),
          price_per_day: pricePerDay.trim() ? Number(pricePerDay) : null,
          age_min: ageMin.trim() ? Number(ageMin) : null,
          age_max: ageMax.trim() ? Number(ageMax) : null,
          spots_available: spotsAvailable.trim() ? Number(spotsAvailable) : null,
          booking_instructions: bookingInstructions.trim(),
          prep_instructions: prepInstructions.trim(),
          source_url: sourceUrl.trim(),
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
        <IonLabel position="stacked">School day</IonLabel>
        <IonSelect
          value={selectedBucketId}
          onIonChange={(e) => selectBucket(e.detail.value as string)}
          interface="action-sheet"
        >
          <IonSelectOption value={CUSTOM_DATE}>Custom date</IonSelectOption>
          {breakBuckets.map((bucket) => (
            <IonSelectOption key={bucket.id} value={bucket.id}>
              {bucket.label}
            </IonSelectOption>
          ))}
        </IonSelect>
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Start date</IonLabel>
        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value)
            setSelectedBucketId(CUSTOM_DATE)
          }}
          style={dateInputStyle}
        />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">End date (optional — defaults to start date)</IonLabel>
        <input
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value)
            setSelectedBucketId(CUSTOM_DATE)
          }}
          style={dateInputStyle}
        />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Location</IonLabel>
        <IonInput value={address} onIonInput={(e) => setAddress(e.detail.value ?? '')} placeholder="Address or place name" />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Price per day</IonLabel>
        <IonInput
          type="number"
          value={pricePerDay}
          onIonInput={(e) => setPricePerDay(e.detail.value ?? '')}
          placeholder="Optional"
        />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Minimum age</IonLabel>
        <IonInput type="number" value={ageMin} onIonInput={(e) => setAgeMin(e.detail.value ?? '')} placeholder="Optional" />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Maximum age</IonLabel>
        <IonInput type="number" value={ageMax} onIonInput={(e) => setAgeMax(e.detail.value ?? '')} placeholder="Optional" />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Spots available</IonLabel>
        <IonInput
          type="number"
          value={spotsAvailable}
          onIonInput={(e) => setSpotsAvailable(e.detail.value ?? '')}
          placeholder="Optional"
        />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Booking instructions</IonLabel>
        <IonTextarea
          value={bookingInstructions}
          onIonInput={(e) => setBookingInstructions(e.detail.value ?? '')}
          placeholder="Optional — when and how to register"
          autoGrow
        />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Prep instructions</IonLabel>
        <IonTextarea
          value={prepInstructions}
          onIonInput={(e) => setPrepInstructions(e.detail.value ?? '')}
          placeholder="Optional — what to bring or prepare beforehand"
          autoGrow
        />
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
