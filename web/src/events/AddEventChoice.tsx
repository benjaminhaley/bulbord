import { IonButton, IonIcon, IonSpinner, IonText } from '@ionic/react'
import { cameraOutline } from 'ionicons/icons'
import { useRef, useState } from 'react'

import { unstyledButtonStyle } from '../theme/layout'
import type { UploadedImage } from '../uploads/api'
import { uploadImage } from '../uploads/api'
import { extractEventFromPhoto, type ExtractedEventFields } from './api'
import type { EventFormInitialValues } from './EventForm'

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
    // Found either printed on the poster itself or via a live web search
    // for the hosting organization's own page (photo-extraction.ts) — shown
    // in the form's existing, already-editable Source URL field.
    source_url: extracted?.source_url ?? null,
    topic: extracted?.topic ?? null,
    image_url: image.image_url,
    thumbnail_url: image.thumbnail_url,
  }
}

// Feedback #93: "take a picture of a poster around town and have everything
// auto populate." Added alongside manual entry, not replacing it (confirmed
// with Ben) — but as the primary action, with manual entry demoted to a
// small subtitle link (Ben, 2026-08-23), matching JoinGate.tsx's SignInLink
// muted-link convention. Renders as a two-option chooser; picking either
// hands the caller a prefilled EventFormInitialValues (or, for manual entry,
// nothing to prefill) so the review/edit/submit steps that follow are
// completely unchanged from a plain manual post either way.
export function AddEventChoice({
  onExtracted,
  onManual,
}: {
  onExtracted: (initial: EventFormInitialValues, meta: { note?: string; sourceName?: string }) => void
  onManual: () => void
}) {
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
      onExtracted(toInitialValues(extracted, image), {
        note: extracted ? undefined : "Couldn't read the details from that photo — it's attached below, fill in the rest yourself.",
        sourceName: extracted?.source_name,
      })
    } catch {
      setNote('Could not upload that photo — try again, or enter the event manually below.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '24px 16px 8px', textAlign: 'center' }}>
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
      <IonButton expand="block" disabled={busy} onClick={() => fileInputRef.current?.click()}>
        <IonIcon slot="start" icon={cameraOutline} />
        {busy ? 'Reading photo…' : 'Add from Photo'}
        {busy && <IonSpinner name="dots" style={{ marginLeft: 8 }} />}
      </IonButton>
      {note && (
        <IonText color="medium">
          <p style={{ fontSize: '0.8125rem', margin: '8px 0 0' }}>{note}</p>
        </IonText>
      )}
      <p className="ion-margin-top" style={{ color: 'var(--ion-color-medium)', fontSize: '0.8125rem' }}>
        or{' '}
        <IonButton
          fill="clear"
          disabled={busy}
          onClick={onManual}
          style={{
            ...unstyledButtonStyle,
            display: 'inline-flex',
            color: 'var(--ion-color-medium)',
            textDecoration: 'underline',
          }}
        >
          enter manually
        </IonButton>
      </p>
    </div>
  )
}
