import { IonButton, IonIcon, IonSpinner, IonText } from '@ionic/react'
import { cameraOutline } from 'ionicons/icons'
import { useRef, useState } from 'react'

import type { UploadedImage } from '../uploads/api'
import { uploadImage } from '../uploads/api'
import { extractEventFromPhoto, type ExtractedEventFields } from './api'
import type { EventFormInitialValues } from './EventForm'

function toInitialValues(extracted: ExtractedEventFields | null, image: UploadedImage): EventFormInitialValues {
  return {
    title: extracted?.title ?? '',
    description: extracted?.description ?? null,
    start_date: extracted?.start_date ?? '',
    all_day: extracted?.all_day ?? false,
    start_time: extracted?.start_time ?? null,
    // The member self-service form has one "Location" field, not the
    // separate location_name/address split sourced events carry — prefer a
    // real street address when the poster printed one, otherwise fall back
    // to the venue name so the field isn't left blank.
    address: extracted?.address ?? extracted?.location_name ?? null,
    source_url: null,
    topic: extracted?.topic ?? null,
    image_url: image.image_url,
    thumbnail_url: image.thumbnail_url,
  }
}

// Feedback #93: "take a picture of a poster around town and have everything
// auto populate." Added alongside manual entry, not replacing it (confirmed
// with Ben) — this only ever hands the caller a prefilled
// EventFormInitialValues, the same shape editing an existing event already
// prefills EventForm with, so the review/edit/submit steps that follow are
// completely unchanged from a manual post.
export function AddFromPhotoButton({ onExtracted }: { onExtracted: (initial: EventFormInitialValues) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function handleFile(file: File) {
    setBusy(true)
    setNote(null)
    try {
      const image = await uploadImage(file, 'events')
      let extracted: ExtractedEventFields | null = null
      try {
        extracted = await extractEventFromPhoto(image.image_url)
      } catch {
        extracted = null
      }
      if (!extracted) {
        setNote("Couldn't read the details from that photo — it's attached below, fill in the rest yourself.")
      }
      onExtracted(toInitialValues(extracted, image))
    } catch {
      setNote('Could not upload that photo — try again, or enter the event manually below.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '4px 16px 8px' }}>
      {/* ionic-exception: Ionic has no file-picker component; a hidden
          native file input triggered by a real button is the standard
          pattern already used by EventForm's own photo attach. */}
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
      <IonButton fill="clear" size="small" disabled={busy} onClick={() => fileInputRef.current?.click()}>
        <IonIcon slot="start" icon={cameraOutline} />
        {busy ? 'Reading photo…' : 'Add from Photo'}
        {busy && <IonSpinner name="dots" style={{ marginLeft: 8 }} />}
      </IonButton>
      {note && (
        <IonText color="medium">
          <p style={{ fontSize: '0.8125rem', margin: '4px 0 0' }}>{note}</p>
        </IonText>
      )}
    </div>
  )
}
