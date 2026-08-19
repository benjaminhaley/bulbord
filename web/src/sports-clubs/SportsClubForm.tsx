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
import { useState } from 'react'

import { API_URL } from '../config'
import type { UploadedImage } from '../uploads/api'
import { type ScheduleType, type SportsClub, type SportsClubInput } from './api'
import { CATEGORY_OPTIONS, categoryLabel } from './format'
import { useSportsClubImageUpload } from './useSportsClubImageUpload'

// Shared by the date/time <input>s below — IonInput doesn't support
// type="date"/type="time", so these are plain inputs styled to match
// Ionic's field look (same pattern as camps/CampForm.tsx).
const dateInputStyle = { border: 'none', font: 'inherit', width: '100%', padding: '8px 0', background: 'transparent' } as const

function toSportsClubInput(image: UploadedImage | null, fields: Omit<SportsClubInput, 'image_url' | 'thumbnail_url'>): SportsClubInput {
  return { ...fields, image_url: image?.image_url ?? null, thumbnail_url: image?.thumbnail_url ?? null }
}

// Shared by the "new listing" and "edit listing" flows — own copy of
// camps/CampForm.tsx's shape. Only title, category, and address are
// required. Deliberately simple, no occurrence editor (same "keep it
// simple" posture as Camps' member self-service — see api/src/db/schema.ts's
// sportsClubs comment) — a member's listing gets a schedule_type toggle and
// optional first/last date + a free-text cadence note, but never its own
// per-date rows.
export function SportsClubForm({
  initial,
  submitLabel,
  errorMessage,
  onSubmit,
  onCancel,
}: {
  initial?: SportsClub
  submitLabel: string
  errorMessage: string
  onSubmit: (input: SportsClubInput) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [scheduleType, setScheduleType] = useState<ScheduleType>(initial?.schedule_type ?? 'fixed_session')
  const [firstDate, setFirstDate] = useState(initial?.first_date ?? '')
  const [lastDate, setLastDate] = useState(initial?.last_date ?? '')
  const [cadenceNote, setCadenceNote] = useState(initial?.cadence_note ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [price, setPrice] = useState(initial?.price ?? '')
  const [priceUnit, setPriceUnit] = useState(initial?.price_unit ?? '')
  const [priceNote, setPriceNote] = useState(initial?.price_note ?? '')
  const [ageMin, setAgeMin] = useState(initial?.age_min != null ? String(initial.age_min) : '')
  const [ageMax, setAgeMax] = useState(initial?.age_max != null ? String(initial.age_max) : '')
  const [signupInstructions, setSignupInstructions] = useState(initial?.signup_instructions ?? '')
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { image, fileInputRef, uploading, attach, remove } = useSportsClubImageUpload(
    initial?.image_url && initial?.thumbnail_url ? { image_url: initial.image_url, thumbnail_url: initial.thumbnail_url } : null,
  )

  const canSubmit = title.trim() && category.trim() && address.trim()

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(
        toSportsClubInput(image, {
          title: title.trim(),
          description: description.trim(),
          category: category.trim(),
          schedule_type: scheduleType,
          first_date: firstDate.trim(),
          last_date: lastDate.trim(),
          cadence_note: cadenceNote.trim(),
          address: address.trim(),
          price: price.trim() ? Number(price) : null,
          price_unit: priceUnit.trim(),
          price_note: priceNote.trim(),
          age_min: ageMin.trim() ? Number(ageMin) : null,
          age_max: ageMax.trim() ? Number(ageMax) : null,
          signup_instructions: signupInstructions.trim(),
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
        <IonInput value={title} onIonInput={(e) => setTitle(e.detail.value ?? '')} autofocus placeholder="e.g. Chess Club" />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Category</IonLabel>
        <IonSelect value={category || null} onIonChange={(e) => setCategory(e.detail.value ?? '')} interface="action-sheet">
          {CATEGORY_OPTIONS.map((option) => (
            <IonSelectOption key={option} value={option}>
              {categoryLabel(option)}
            </IonSelectOption>
          ))}
        </IonSelect>
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Description</IonLabel>
        <IonTextarea value={description} onIonInput={(e) => setDescription(e.detail.value ?? '')} autoGrow />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Schedule type</IonLabel>
        <IonSelect
          value={scheduleType}
          onIonChange={(e) => setScheduleType(e.detail.value as ScheduleType)}
          interface="action-sheet"
        >
          <IonSelectOption value="fixed_session">A specific session (has its own start/end)</IonSelectOption>
          <IonSelectOption value="ongoing">Ongoing (join anytime, no set end)</IonSelectOption>
        </IonSelect>
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">{scheduleType === 'ongoing' ? 'Started (optional)' : 'First day'}</IonLabel>
        <input type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} style={dateInputStyle} />
      </IonItem>
      {scheduleType === 'fixed_session' && (
        <IonItem>
          <IonLabel position="stacked">Last day</IonLabel>
          <input type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} style={dateInputStyle} />
        </IonItem>
      )}
      <IonItem>
        <IonLabel position="stacked">Cadence</IonLabel>
        <IonTextarea
          value={cadenceNote}
          onIonInput={(e) => setCadenceNote(e.detail.value ?? '')}
          placeholder="Optional — e.g. Every Tuesday, 4-5pm"
          autoGrow
        />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Location</IonLabel>
        <IonInput value={address} onIonInput={(e) => setAddress(e.detail.value ?? '')} placeholder="Address or place name" />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Price</IonLabel>
        <IonInput type="number" value={price} onIonInput={(e) => setPrice(e.detail.value ?? '')} placeholder="Optional" />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Price unit</IonLabel>
        <IonInput
          value={priceUnit}
          onIonInput={(e) => setPriceUnit(e.detail.value ?? '')}
          placeholder="Optional — e.g. per class, per season"
        />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Price note</IonLabel>
        <IonTextarea
          value={priceNote}
          onIonInput={(e) => setPriceNote(e.detail.value ?? '')}
          placeholder="Optional — a short aside, e.g. a sibling discount"
          autoGrow
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
        <IonLabel position="stacked">Sign-up instructions</IonLabel>
        <IonTextarea
          value={signupInstructions}
          onIonInput={(e) => setSignupInstructions(e.detail.value ?? '')}
          placeholder="Optional — when and how to sign up"
          autoGrow
        />
      </IonItem>
      <IonItem>
        <IonLabel position="stacked">Sign-up URL</IonLabel>
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
