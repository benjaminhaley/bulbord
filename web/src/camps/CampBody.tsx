import { IonBadge, IonButton, IonIcon } from '@ionic/react'
import { closeOutline } from 'ionicons/icons'
import type { ReactNode } from 'react'

import { API_URL } from '../config'
import {
  InlineCheckboxInput,
  InlineDateInput,
  InlineField,
  InlineNumberInput,
  InlineSelectInput,
  InlineTextInput,
  InlineTextareaInput,
  InlineTimeInput,
} from '../edit-history/InlineField'
import { factLineStyle, headingContentGap, sectionDividerStyle } from '../theme/layout'
import type { CampOptionLine, CampPrepLine } from './api'
import {
  bookingStatusChipStyle,
  bookingStatusLabel,
  campDetailsLine,
  distanceLabel,
  formatDateRange,
  mapUrl,
  optionAgeCell,
  optionPriceCell,
  optionTimeCell,
  shortAddress,
  sortOptionsByPrice,
  timeLabel,
} from './format'

// Feedback #141 (2026-09-07): CampDetailPage's own read-mode rendering,
// pulled out into its own component the same way EventBody.tsx already was
// for Events (Ben, 2026-09-06, re: EventBody: "use the same engine with
// just a couple options set" — extended here so Camps' inline edit mode can
// reuse it too, not because Camps and Events share any code between
// themselves — they still don't, see CLAUDE.md's "fresh, non-shared clone"
// rule). `editing`/`draft`/`onFieldChange`/`highlightFields` mirror
// EventBody's own shape exactly, so the three entities' detail pages all
// drive their inline editors the same way.

const BOOKING_STATUS_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: 'open', label: 'Open' },
  { value: 'full', label: 'Full' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'not_opened', label: 'Not opened' },
]

function LabeledBulletList({ lines }: { lines: CampPrepLine[] }) {
  return (
    <ul style={{ marginTop: headingContentGap.marginTop, marginBottom: 4, paddingLeft: 20 }}>
      {lines.map((line, i) => (
        <li key={`${line.label}-${i}`} style={{ marginBottom: 8 }}>
          <strong>{line.label}</strong>
          {line.detail && <div>{line.detail}</div>}
        </li>
      ))}
    </ul>
  )
}

// Same inline-input styling this whole feature already uses (see
// edit-history/InlineField.tsx) — a compact stacked-row editor for one
// prep-item, add/remove affordances at the list's own edges rather than a
// detached form section.
function EditablePrepList({ items, onChange }: { items: CampPrepLine[]; onChange: (items: CampPrepLine[]) => void }) {
  function updateRow(i: number, patch: Partial<CampPrepLine>) {
    onChange(items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)))
  }
  function removeRow(i: number) {
    onChange(items.filter((_, idx) => idx !== i))
  }
  return (
    <div style={{ marginTop: headingContentGap.marginTop }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <InlineTextInput value={item.label} onChange={(v) => updateRow(i, { label: v })} placeholder="Label (e.g. Lunch)" />
            <InlineTextInput value={item.detail} onChange={(v) => updateRow(i, { detail: v })} placeholder="Detail (optional)" />
          </div>
          <IonButton fill="clear" color="medium" size="small" onClick={() => removeRow(i)}>
            <IonIcon slot="icon-only" icon={closeOutline} />
          </IonButton>
        </div>
      ))}
      <IonButton fill="clear" size="small" onClick={() => onChange([...items, { label: '', detail: '' }])}>
        + Add item
      </IonButton>
    </div>
  )
}

function OptionCell({ value }: { value: string }) {
  return value === '—' ? <span style={{ color: 'var(--ion-color-medium)' }}>—</span> : <>{value}</>
}

function OptionsTable({ options }: { options: CampOptionLine[] }) {
  const sorted = sortOptionsByPrice(options)
  const nowrapCellStyle = { verticalAlign: 'top' as const, padding: '6px', whiteSpace: 'nowrap' as const }
  return (
    <div style={{ overflowX: 'auto', marginTop: headingContentGap.marginTop, marginBottom: 4 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ color: 'var(--ion-color-medium)', fontSize: 12 }}>
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px 0' }} />
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px', whiteSpace: 'nowrap' }}>Time</th>
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px', whiteSpace: 'nowrap' }}>Ages</th>
            <th style={{ textAlign: 'right', fontWeight: 'normal', padding: '0 0 4px 6px', whiteSpace: 'nowrap' }}>Price/day</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((option, i) => (
            <tr key={`${option.label}-${i}`} style={{ borderTop: '1px solid var(--ion-color-step-150, #d9d9d9)' }}>
              <td style={{ verticalAlign: 'top', padding: '6px 6px 6px 0' }}>
                <strong>{option.label}</strong>
                {option.note && <div style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>{option.note}</div>}
              </td>
              <td style={nowrapCellStyle}>
                <OptionCell value={optionTimeCell(option.start_time, option.end_time)} />
              </td>
              <td style={nowrapCellStyle}>
                <OptionCell value={optionAgeCell(option.age_min, option.age_max)} />
              </td>
              <td style={{ ...nowrapCellStyle, textAlign: 'right', padding: '6px 0 6px 6px' }}>
                <OptionCell value={optionPriceCell(option.price)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Feedback #141: options become a real inline table editor once "all the
// fields" opened up from seed-only to member-editable — same column shape
// as the read-mode table, just with an input per cell and a remove/add
// affordance at the edges, rather than a detached form section.
function EditableOptionsTable({ options, onChange }: { options: CampOptionLine[]; onChange: (options: CampOptionLine[]) => void }) {
  function updateRow(i: number, patch: Partial<CampOptionLine>) {
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))
  }
  function removeRow(i: number) {
    onChange(options.filter((_, idx) => idx !== i))
  }
  return (
    <div style={{ marginTop: headingContentGap.marginTop }}>
      {options.map((option, i) => (
        <div key={i} style={{ border: '1px solid var(--ion-color-step-150, #d9d9d9)', borderRadius: 8, padding: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <InlineTextInput value={option.label} onChange={(v) => updateRow(i, { label: v })} placeholder="Option label" />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <InlineTimeInput value={option.start_time ?? ''} onChange={(v) => updateRow(i, { start_time: v || null })} />
                <span>–</span>
                <InlineTimeInput value={option.end_time ?? ''} onChange={(v) => updateRow(i, { end_time: v || null })} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <InlineNumberInput value={option.age_min != null ? String(option.age_min) : ''} onChange={(v) => updateRow(i, { age_min: v ? Number(v) : null })} placeholder="Min age" />
                <InlineNumberInput value={option.age_max != null ? String(option.age_max) : ''} onChange={(v) => updateRow(i, { age_max: v ? Number(v) : null })} placeholder="Max age" />
                <InlineNumberInput value={option.price ?? ''} onChange={(v) => updateRow(i, { price: v || null })} placeholder="Price" />
              </div>
              <InlineTextInput value={option.note ?? ''} onChange={(v) => updateRow(i, { note: v || null })} placeholder="Note (optional)" />
            </div>
            <IonButton fill="clear" color="medium" size="small" onClick={() => removeRow(i)}>
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </div>
        </div>
      ))}
      <IonButton
        fill="clear"
        size="small"
        onClick={() => onChange([...options, { label: '', start_time: null, end_time: null, price: null, age_min: null, age_max: null, note: null }])}
      >
        + Add option
      </IonButton>
    </div>
  )
}

export interface CampBodyFields {
  image_url: string | null
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  address: string | null
  location_name: string | null
  distance_miles: string | null
  description: string | null
  submitted_by: { name: string; avatar_url: string | null } | null
  options: CampOptionLine[] | null
  options_note: string | null
  prep_items: CampPrepLine[] | null
  prep_note: string | null
  booking_status: string | null
  booking_instructions: string | null
  price_per_day: string | null
  price_is_estimated: boolean
  age_min: number | null
  age_max: number | null
  spots_available: number | null
}

export interface CampBodyDraft {
  title: string
  description: string
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  address: string
  location_name: string
  price_per_day: string
  price_is_estimated: boolean
  options: CampOptionLine[]
  options_note: string
  age_min: string
  age_max: string
  spots_available: string
  booking_status: string
  booking_instructions: string
  prep_items: CampPrepLine[]
  prep_note: string
  source_url: string
}

export function CampBody({
  camp,
  editing = false,
  draft,
  onFieldChange,
  highlightFields,
  imageEditor,
  interestedBadge,
  commentsSection,
}: {
  camp: CampBodyFields
  editing?: boolean
  draft?: CampBodyDraft
  onFieldChange?: <K extends keyof CampBodyDraft>(key: K, value: CampBodyDraft[K]) => void
  highlightFields?: Set<string>
  imageEditor?: ReactNode
  // Not part of the WYSIWYG editable content — omitted entirely while
  // editing/viewing a historical version, same as EventBody's own
  // afterWhen-slot equivalents.
  interestedBadge?: ReactNode
  commentsSection?: ReactNode
}) {
  const isHighlighted = (key: string) => highlightFields?.has(key) ?? false
  const set = <K extends keyof CampBodyDraft>(key: K, value: CampBodyDraft[K]) => onFieldChange?.(key, value)

  const hasOptions = editing ? (draft?.options.length ?? 0) > 0 : camp.options != null && camp.options.length > 0
  const details = !editing ? campDetailsLine(camp, { includePrice: !hasOptions, includeAge: !hasOptions }) : null

  return (
    <>
      {editing && draft && (
        <InlineField
          editing
          hasValue
          style={{ margin: '0 0 12px', fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.3 }}
          highlighted={isHighlighted('title')}
          readContent={null}
          editContent={<InlineTextInput value={draft.title} onChange={(v) => set('title', v)} placeholder="Title" />}
        />
      )}
      {editing && imageEditor ? imageEditor : camp.image_url && <img src={`${API_URL}${camp.image_url}`} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 16 }} />}
      <InlineField
        editing={editing}
        hasValue
        highlighted={isHighlighted('start_date') || isHighlighted('end_date')}
        readContent={formatDateRange(camp.start_date, camp.end_date, undefined, 'detailed')}
        editContent={
          draft && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <InlineDateInput value={draft.start_date} onChange={(v) => set('start_date', v)} />
              <span>–</span>
              <InlineDateInput value={draft.end_date} onChange={(v) => set('end_date', v)} />
            </div>
          )
        }
      />
      {(!editing ? !hasOptions : true) && (
        <InlineField
          editing={editing}
          hasValue
          highlighted={isHighlighted('start_time') || isHighlighted('end_time')}
          readContent={timeLabel(camp.start_time, camp.end_time)}
          editContent={
            draft && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <InlineTimeInput value={draft.start_time} onChange={(v) => set('start_time', v)} />
                <span>–</span>
                <InlineTimeInput value={draft.end_time} onChange={(v) => set('end_time', v)} />
              </div>
            )
          }
        />
      )}
      {!editing && camp.submitted_by && (
        <p style={{ ...factLineStyle, color: 'var(--ion-color-medium)' }}>Posted by {camp.submitted_by.name}</p>
      )}
      {!editing && details && <p style={factLineStyle}>{details}</p>}
      {!editing && interestedBadge}
      {editing && draft && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <InlineNumberInput value={draft.price_per_day} onChange={(v) => set('price_per_day', v)} placeholder="Price per day" />
          <InlineNumberInput value={draft.age_min} onChange={(v) => set('age_min', v)} placeholder="Min age" />
          <InlineNumberInput value={draft.age_max} onChange={(v) => set('age_max', v)} placeholder="Max age" />
        </div>
      )}
      {editing && draft && (
        <div style={{ marginBottom: 6 }}>
          <InlineCheckboxInput checked={draft.price_is_estimated} onChange={(v) => set('price_is_estimated', v)} label="Price is estimated" />
        </div>
      )}
      {editing && draft && (
        <InlineNumberInput value={draft.spots_available} onChange={(v) => set('spots_available', v)} placeholder="Spots available (optional)" />
      )}
      <InlineField
        editing={editing}
        hasValue={!!camp.location_name || !!draft?.location_name}
        highlighted={isHighlighted('location_name')}
        readContent={camp.location_name}
        editContent={<InlineTextInput value={draft?.location_name ?? ''} onChange={(v) => set('location_name', v)} placeholder="Location name (optional)" />}
      />
      <InlineField
        editing={editing}
        hasValue={!!camp.address || !!draft?.address}
        highlighted={isHighlighted('address')}
        readContent={
          camp.address && (
            <>
              <a href={mapUrl(camp.address)} target="_blank" rel="noreferrer">
                {shortAddress(camp.address)}
              </a>
              {' · '}
              {distanceLabel(camp.distance_miles)}
            </>
          )
        }
        editContent={<InlineTextInput value={draft?.address ?? ''} onChange={(v) => set('address', v)} placeholder="Address" />}
      />
      <InlineField
        editing={editing}
        hasValue={!!camp.description || !!draft?.description}
        highlighted={isHighlighted('description')}
        readContent={camp.description}
        editContent={<InlineTextareaInput value={draft?.description ?? ''} onChange={(v) => set('description', v)} placeholder="Description (optional)" />}
      />
      {editing && draft && (
        <InlineField
          editing
          hasValue
          highlighted={isHighlighted('source_url')}
          readContent={null}
          editContent={<InlineTextInput type="url" value={draft.source_url} onChange={(v) => set('source_url', v)} placeholder="Source URL (optional)" />}
        />
      )}

      {((!editing && ((camp.options && camp.options.length > 0) || camp.options_note)) || editing) && (
        <>
          <hr style={sectionDividerStyle} />
          <h2>Options</h2>
          {!editing ? (
            <>
              {camp.options && camp.options.length > 0 && <OptionsTable options={camp.options} />}
              {camp.options_note && <p style={factLineStyle}>{camp.options_note}</p>}
            </>
          ) : (
            draft && (
              <>
                <EditableOptionsTable options={draft.options} onChange={(v) => set('options', v)} />
                <InlineTextareaInput value={draft.options_note} onChange={(v) => set('options_note', v)} placeholder="Options note (optional — e.g. a sibling discount)" />
              </>
            )
          )}
        </>
      )}

      {((!editing && ((camp.prep_items && camp.prep_items.length > 0) || camp.prep_note)) || editing) && (
        <>
          <hr style={sectionDividerStyle} />
          <h2>What to bring / prepare</h2>
          {!editing ? (
            camp.prep_items && camp.prep_items.length > 0 ? (
              <LabeledBulletList lines={camp.prep_items} />
            ) : (
              camp.prep_note && <p style={factLineStyle}>{camp.prep_note}</p>
            )
          ) : (
            draft && (
              <>
                <EditablePrepList items={draft.prep_items} onChange={(v) => set('prep_items', v)} />
                <InlineTextareaInput value={draft.prep_note} onChange={(v) => set('prep_note', v)} placeholder="Prep note (optional)" />
              </>
            )
          )}
        </>
      )}

      {!editing && commentsSection}

      <hr style={sectionDividerStyle} />
      <h2>Booking</h2>
      {!editing ? (
        <IonBadge style={{ ...bookingStatusChipStyle(camp.booking_status), fontWeight: 500, marginBottom: 8 }}>
          {bookingStatusLabel(camp.booking_status)}
        </IonBadge>
      ) : (
        draft && (
          <div style={{ marginBottom: 8 }}>
            <InlineSelectInput value={draft.booking_status} onChange={(v) => set('booking_status', v)} options={BOOKING_STATUS_OPTIONS} />
          </div>
        )
      )}
      <InlineField
        editing={editing}
        hasValue={!!camp.booking_instructions || !!draft?.booking_instructions}
        highlighted={isHighlighted('booking_instructions')}
        readContent={camp.booking_instructions && <span style={{ whiteSpace: 'pre-wrap' }}>{camp.booking_instructions}</span>}
        editContent={<InlineTextareaInput value={draft?.booking_instructions ?? ''} onChange={(v) => set('booking_instructions', v)} placeholder="Booking instructions (optional)" />}
      />
    </>
  )
}
