import { IonButton, IonCheckbox, IonIcon, IonInput, IonSelect, IonSelectOption, IonSpinner, IonTextarea } from '@ionic/react'
import { createOutline } from 'ionicons/icons'
import type { ReactNode, RefObject } from 'react'

import { API_URL } from '../config'
import { factLineStyle } from '../theme/layout'

// Feedback #141 (2026-09-07): the shared primitive behind every detail
// page's inline, WYSIWYG edit mode — Ben's own direction was "editing
// should happen in line and stay with the WYSIWYG format, still using the
// same components and rendering in the same ways," not a separate plain
// form screen. The core trick for a smooth, non-bouncing toggle: `InlineField`
// always renders the *same* wrapper (one `<div>`, one style, one DOM
// position) whether reading or editing — only the content *inside* it
// swaps, so entering/leaving edit mode never remounts or reflows the
// surrounding page, which is what keeps scroll position stable. Each
// Inline*Input below is stripped of Ionic's default input chrome (padding,
// min-height) so it sits at roughly the same box size as the plain text it
// replaces — a real Ionic component throughout (IonInput/IonTextarea/
// IonSelect/IonCheckbox), never a raw HTML control, so this stays
// check-ionic-coverage.mjs-compliant like every other form in this app.

// Zeroes Ionic's own input/textarea/select padding and min-height so the
// control's box closely matches the plain <div style={factLineStyle}> text
// it visually replaces, rather than the browser's much taller default
// form-control chrome — see theme/layout.ts's unstyledButtonStyle for the
// same "inline style always wins over the shadow-DOM host rule" technique.
const inlineInputStyle = {
  '--padding-start': '0',
  '--padding-end': '0',
  '--padding-top': '0',
  '--padding-bottom': '0',
  '--min-height': 'unset',
  '--background': 'transparent',
  fontSize: 'inherit',
  fontFamily: 'inherit',
  color: 'inherit',
} as const

const nativeInputStyle = { border: 'none', font: 'inherit', padding: 0, background: 'transparent', color: 'inherit' } as const

// The one shared wrapper — same element, same style, in read mode and edit
// mode alike. Hides entirely when there's nothing to show and the page
// isn't in edit mode (matches every optional-field's existing "only render
// if present" convention) — but always renders while editing, so a member
// can fill in a field that was previously empty.
export function InlineField({
  editing,
  hasValue,
  readContent,
  editContent,
  style = factLineStyle,
  highlighted = false,
}: {
  editing: boolean
  hasValue: boolean
  readContent: ReactNode
  editContent: ReactNode
  style?: React.CSSProperties
  // Feedback #141: a history-detail page renders an old snapshot with the
  // fields that differ from the *current* live version flagged — same
  // wrapper, just a red accent, not a different component.
  highlighted?: boolean
}) {
  if (!editing && !hasValue) return null
  return (
    <div
      style={
        highlighted
          ? { ...style, borderLeft: '3px solid var(--ion-color-danger)', paddingLeft: 8, marginLeft: -11 }
          : style
      }
    >
      {editing ? editContent : readContent}
    </div>
  )
}

export function InlineTextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'url'
}) {
  return (
    <IonInput
      value={value}
      onIonInput={(e) => onChange(e.detail.value ?? '')}
      placeholder={placeholder}
      type={type}
      style={inlineInputStyle}
    />
  )
}

// `type="text"` + `inputmode="decimal"` rather than `type="number"` —
// found via a real WebKit pass (feedback #141's own re-audit, 2026-09-07):
// several of these sit side-by-side in one compact row (price/min age/max
// age), and Safari's native number-input spinner arrows are wide enough to
// visibly overlap the neighboring field's own placeholder text at this
// width — a real, WebKit-specific bug this exact layout introduced (the
// pre-existing CampForm.tsx also uses `type="number"`, but never puts more
// than one per row, so it never collided). `inputmode="decimal"` still
// brings up the numeric keyboard on a real phone without any native
// spinner UI to collide with anything, in any engine.
export function InlineNumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <IonInput
      type="text"
      inputmode="decimal"
      value={value}
      onIonInput={(e) => onChange(e.detail.value ?? '')}
      placeholder={placeholder}
      style={inlineInputStyle}
    />
  )
}

export function InlineTextareaInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <IonTextarea value={value} onIonInput={(e) => onChange(e.detail.value ?? '')} placeholder={placeholder} autoGrow style={inlineInputStyle} />
}

// IonInput has no type="date"/"time" — same native-input-styled-to-match
// pattern EventForm.tsx/CampForm.tsx already use for their own date/time
// fields.
export function InlineDateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={nativeInputStyle} />
}

export function InlineTimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="time" value={value} onChange={(e) => onChange(e.target.value)} style={nativeInputStyle} />
}

export function InlineSelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <IonSelect value={value || null} onIonChange={(e) => onChange(e.detail.value ?? '')} placeholder={placeholder} interface="action-sheet" style={inlineInputStyle}>
      {options.map((o) => (
        <IonSelectOption key={o.value} value={o.value}>
          {o.label}
        </IonSelectOption>
      ))}
    </IonSelect>
  )
}

export function InlineCheckboxInput({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <IonCheckbox checked={checked} onIonChange={(e) => onChange(e.detail.checked)} style={inlineInputStyle}>
      {label}
    </IonCheckbox>
  )
}

// The one image-edit block shared by all three detail pages' inline editors
// — renders in the exact spot the static photo already occupies (passed as
// each Body component's own `imageEditor` slot), with a small overlaid
// camera button rather than the separate "attach a photo" section below the
// form the old EventForm/CampForm/SportsClubForm used — "same rendering, in
// place." Each caller supplies its own useXImageUpload() hook's state, since
// that upload logic stays at the page level (this is presentation only).
export function InlineImageEditor({
  thumbnailUrl,
  uploading,
  fileInputRef,
  onAttach,
}: {
  thumbnailUrl: string | null
  uploading: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  onAttach: (file: File) => void
}) {
  return (
    <div style={{ position: 'relative', width: '100%', marginBottom: 16 }}>
      {/* ionic-exception: Ionic has no file-picker component; a hidden
          native file input triggered by a real button is the standard
          pattern this app already uses in EventForm.tsx/CampForm.tsx/
          SportsClubForm.tsx. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onAttach(file)
          e.target.value = ''
        }}
      />
      {thumbnailUrl ? (
        <img src={`${API_URL}${thumbnailUrl}`} alt="" style={{ width: '100%', borderRadius: 12, display: 'block' }} />
      ) : (
        <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 12, background: 'var(--ion-color-light)' }} />
      )}
      <IonButton
        fill="solid"
        color="dark"
        size="small"
        style={{ position: 'absolute', bottom: 8, right: 8, '--border-radius': '50%' }}
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {/* A pencil, not a camera (Ben, 2026-09-07: clearer that this is
            "the path to changing the photo," matching the pencil used for
            editing every other field on this same page). */}
        {uploading ? <IonSpinner name="dots" /> : <IonIcon slot="icon-only" icon={createOutline} />}
      </IonButton>
    </div>
  )
}
