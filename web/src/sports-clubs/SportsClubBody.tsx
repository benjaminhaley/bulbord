import { IonBadge, IonButton, IonIcon } from '@ionic/react'
import { closeOutline } from 'ionicons/icons'
import { useState, type ReactNode } from 'react'

import { API_URL } from '../config'
import {
  InlineDateInput,
  InlineField,
  InlineNumberInput,
  InlineSelectInput,
  InlineTextInput,
  InlineTextareaInput,
  InlineTimeInput,
} from '../edit-history/InlineField'
import { factLineStyle, headingContentGap, sectionDividerStyle } from '../theme/layout'
import type { ScheduleType, SportsClubOccurrence, SportsClubOptionLine } from './api'
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  distanceLabel,
  isLocationRedundantWithTitle,
  mapUrl,
  occurrenceLabel,
  optionAgeCell,
  optionPriceCell,
  optionTimeCell,
  originalPriceLabel,
  scheduleSummary,
  shortAddress,
  signupStatusChipStyle,
  signupStatusLabel,
  sportsClubDetailsLine,
} from './format'

// Feedback #141 (2026-09-07): SportsClubDetailPage's own read-mode
// rendering, pulled out the same way EventBody.tsx/CampBody.tsx already
// were — see CampBody.tsx's header for the full rationale (this stays a
// wholly separate, non-shared copy, per CLAUDE.md's "fresh clone" rule).

const OCCURRENCE_PREVIEW_LIMIT = 6

const SIGNUP_STATUS_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: 'open', label: 'Open' },
  { value: 'full', label: 'Full' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'not_opened', label: 'Not opened' },
]

function OptionCell({ value }: { value: string }) {
  return value === '—' ? <span style={{ color: 'var(--ion-color-medium)' }}>—</span> : <>{value}</>
}

function OptionsTable({ options }: { options: SportsClubOptionLine[] }) {
  const nowrapCellStyle = { verticalAlign: 'top' as const, padding: '6px', whiteSpace: 'nowrap' as const }
  return (
    <div style={{ overflowX: 'auto', marginTop: headingContentGap.marginTop, marginBottom: 4 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ color: 'var(--ion-color-medium)', fontSize: 12 }}>
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px 0' }} />
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px', whiteSpace: 'nowrap' }}>Time</th>
            <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '0 6px 4px', whiteSpace: 'nowrap' }}>Ages</th>
            <th style={{ textAlign: 'right', fontWeight: 'normal', padding: '0 0 4px 6px', whiteSpace: 'nowrap' }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {options.map((option, i) => (
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
                <OptionCell value={optionPriceCell(option.price, option.price_unit)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Same inline-editable-table pattern as CampBody's EditableOptionsTable,
// with the one field Sports & Clubs' own SportsClubOptionLine adds
// (price_unit — "per class", "per season") that Camps' CampOptionLine
// doesn't have.
function EditableOptionsTable({ options, onChange }: { options: SportsClubOptionLine[]; onChange: (options: SportsClubOptionLine[]) => void }) {
  function updateRow(i: number, patch: Partial<SportsClubOptionLine>) {
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
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <InlineNumberInput value={option.price ?? ''} onChange={(v) => updateRow(i, { price: v || null })} placeholder="Price" />
                <InlineTextInput value={option.price_unit ?? ''} onChange={(v) => updateRow(i, { price_unit: v || null })} placeholder="per class, per season..." />
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
        onClick={() =>
          onChange([...options, { label: '', start_time: null, end_time: null, price: null, price_unit: null, age_min: null, age_max: null, note: null }])
        }
      >
        + Add option
      </IonButton>
    </div>
  )
}

export interface SportsClubBodyFields {
  title: string
  image_url: string | null
  schedule_type: ScheduleType
  first_date: string | null
  last_date: string | null
  cadence_note: string | null
  description: string | null
  price_per_week: string | null
  price: string | null
  price_unit: string | null
  price_note: string | null
  age_min: number | null
  age_max: number | null
  distance_miles: string | null
  submitted_by: { name: string; avatar_url: string | null } | null
  options: SportsClubOptionLine[] | null
  location_name: string | null
  address: string | null
  signup_status: string | null
  signup_instructions: string | null
  occurrences: SportsClubOccurrence[]
}

export interface SportsClubBodyDraft {
  title: string
  description: string
  category: string
  schedule_type: ScheduleType
  first_date: string
  last_date: string
  cadence_note: string
  age_min: string
  age_max: string
  price: string
  price_unit: string
  price_per_week: string
  price_note: string
  options: SportsClubOptionLine[]
  address: string
  location_name: string
  signup_status: string
  signup_instructions: string
  source_url: string
}

export function SportsClubBody({
  club,
  editing = false,
  draft,
  onFieldChange,
  highlightFields,
  imageEditor,
  interestedBadge,
  commentsSection,
}: {
  club: SportsClubBodyFields
  editing?: boolean
  draft?: SportsClubBodyDraft
  onFieldChange?: <K extends keyof SportsClubBodyDraft>(key: K, value: SportsClubBodyDraft[K]) => void
  highlightFields?: Set<string>
  imageEditor?: ReactNode
  interestedBadge?: ReactNode
  commentsSection?: ReactNode
}) {
  const isHighlighted = (key: string) => highlightFields?.has(key) ?? false
  const set = <K extends keyof SportsClubBodyDraft>(key: K, value: SportsClubBodyDraft[K]) => onFieldChange?.(key, value)

  const hasOptions = editing ? (draft?.options.length ?? 0) > 0 : club.options != null && club.options.length > 0
  const details = !editing ? sportsClubDetailsLine(club, { includePrice: !hasOptions, includeAge: !hasOptions }) : null
  const originalPrice = !editing ? originalPriceLabel(club.price, club.price_unit) : null

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
      {editing && imageEditor ? imageEditor : club.image_url && <img src={`${API_URL}${club.image_url}`} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 16 }} />}
      {editing && draft && (
        <div style={{ marginBottom: 6 }}>
          <InlineSelectInput
            value={draft.category}
            onChange={(v) => set('category', v)}
            options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: categoryLabel(c) }))}
            placeholder="Category"
          />
        </div>
      )}
      <InlineField
        editing={editing}
        hasValue
        highlighted={isHighlighted('schedule_type') || isHighlighted('first_date') || isHighlighted('last_date')}
        readContent={scheduleSummary(club)}
        editContent={
          draft && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <InlineSelectInput
                value={draft.schedule_type}
                onChange={(v) => set('schedule_type', v as ScheduleType)}
                options={[
                  { value: 'fixed_session', label: 'A specific session (has its own start/end)' },
                  { value: 'ongoing', label: 'Ongoing (join anytime, no set end)' },
                ]}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <InlineDateInput value={draft.first_date} onChange={(v) => set('first_date', v)} />
                {draft.schedule_type === 'fixed_session' && (
                  <>
                    <span>–</span>
                    <InlineDateInput value={draft.last_date} onChange={(v) => set('last_date', v)} />
                  </>
                )}
              </div>
            </div>
          )
        }
      />
      {(!editing ? !hasOptions : true) && (
        <InlineField
          editing={editing}
          hasValue={!!club.cadence_note || !!draft?.cadence_note}
          highlighted={isHighlighted('cadence_note')}
          readContent={club.cadence_note}
          editContent={<InlineTextInput value={draft?.cadence_note ?? ''} onChange={(v) => set('cadence_note', v)} placeholder="Cadence (optional — e.g. Every Tuesday, 4-5pm)" />}
        />
      )}
      {!editing && club.submitted_by && (
        <p style={{ ...factLineStyle, color: 'var(--ion-color-medium)' }}>Posted by {club.submitted_by.name}</p>
      )}
      {!editing && details && <p style={factLineStyle}>{details}</p>}
      {!editing && !hasOptions && club.price_note && <p style={factLineStyle}>{club.price_note}</p>}
      {!editing && !hasOptions && originalPrice && (
        <p style={{ ...factLineStyle, color: 'var(--ion-color-medium)', fontSize: '0.85em' }}>Published rate: {originalPrice}</p>
      )}
      {!editing && interestedBadge}
      {editing && draft && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <InlineNumberInput value={draft.age_min} onChange={(v) => set('age_min', v)} placeholder="Min age" />
          <InlineNumberInput value={draft.age_max} onChange={(v) => set('age_max', v)} placeholder="Max age" />
          <InlineNumberInput value={draft.price} onChange={(v) => set('price', v)} placeholder="Price" />
          <InlineTextInput value={draft.price_unit} onChange={(v) => set('price_unit', v)} placeholder="per class, per season..." />
          <InlineNumberInput value={draft.price_per_week} onChange={(v) => set('price_per_week', v)} placeholder="Price/week override (optional)" />
        </div>
      )}
      {editing && draft && (
        <InlineTextareaInput value={draft.price_note} onChange={(v) => set('price_note', v)} placeholder="Price note (optional)" />
      )}
      <InlineField
        editing={editing}
        hasValue={(!!club.location_name && !isLocationRedundantWithTitle(club.title, club.location_name)) || !!draft?.location_name}
        highlighted={isHighlighted('location_name')}
        readContent={club.location_name}
        editContent={<InlineTextInput value={draft?.location_name ?? ''} onChange={(v) => set('location_name', v)} placeholder="Location name (optional)" />}
      />
      <InlineField
        editing={editing}
        hasValue={!!club.address || !!draft?.address}
        highlighted={isHighlighted('address')}
        readContent={
          club.address && (
            <>
              <a href={mapUrl(club.address)} target="_blank" rel="noreferrer">
                {shortAddress(club.address)}
              </a>
              {' · '}
              {distanceLabel(club.distance_miles)}
            </>
          )
        }
        editContent={<InlineTextInput value={draft?.address ?? ''} onChange={(v) => set('address', v)} placeholder="Address" />}
      />
      <InlineField
        editing={editing}
        hasValue={!!club.description || !!draft?.description}
        highlighted={isHighlighted('description')}
        readContent={club.description}
        editContent={<InlineTextareaInput value={draft?.description ?? ''} onChange={(v) => set('description', v)} placeholder="Description (optional)" />}
      />
      {editing && draft && (
        <InlineField
          editing
          hasValue
          highlighted={isHighlighted('source_url')}
          readContent={null}
          editContent={<InlineTextInput type="url" value={draft.source_url} onChange={(v) => set('source_url', v)} placeholder="Sign-up URL (optional)" />}
        />
      )}

      {((!editing && hasOptions && club.options) || editing) && (
        <>
          <hr style={sectionDividerStyle} />
          <h2>Options</h2>
          {!editing ? (
            <>
              {club.cadence_note && <p style={factLineStyle}>{club.cadence_note}</p>}
              {club.options && <OptionsTable options={club.options} />}
              {club.price_note && <p style={factLineStyle}>{club.price_note}</p>}
            </>
          ) : (
            draft && <EditableOptionsTable options={draft.options} onChange={(v) => set('options', v)} />
          )}
        </>
      )}

      {!editing && club.occurrences.length > 0 && <OccurrenceList occurrences={club.occurrences} />}

      {!editing && commentsSection}

      <hr style={sectionDividerStyle} />
      <h2>Sign-up</h2>
      {!editing ? (
        <IonBadge style={{ ...signupStatusChipStyle(club.signup_status), fontWeight: 500, marginBottom: 8 }}>
          {signupStatusLabel(club.signup_status)}
        </IonBadge>
      ) : (
        draft && (
          <div style={{ marginBottom: 8 }}>
            <InlineSelectInput value={draft.signup_status} onChange={(v) => set('signup_status', v)} options={SIGNUP_STATUS_OPTIONS} />
          </div>
        )
      )}
      <InlineField
        editing={editing}
        hasValue={!!club.signup_instructions || !!draft?.signup_instructions}
        highlighted={isHighlighted('signup_instructions')}
        readContent={club.signup_instructions && <span style={{ whiteSpace: 'pre-wrap' }}>{club.signup_instructions}</span>}
        editContent={<InlineTextareaInput value={draft?.signup_instructions ?? ''} onChange={(v) => set('signup_instructions', v)} placeholder="Sign-up instructions (optional)" />}
      />
    </>
  )
}

// Read-only always — a member-submitted listing never gets real occurrence
// rows (see CLAUDE.md's "self-service stays simple" precedent), so there's
// nothing to edit here regardless of edit mode. Its own local reveal state
// (unrelated to the edit-session draft) mirrors the original
// SportsClubDetailPage.tsx's showAllOccurrences behavior.
function OccurrenceList({ occurrences }: { occurrences: SportsClubOccurrence[] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? occurrences : occurrences.slice(0, OCCURRENCE_PREVIEW_LIMIT)
  const remaining = occurrences.length - visible.length
  return (
    <>
      <hr style={sectionDividerStyle} />
      <h2>Upcoming dates</h2>
      <ul style={{ marginTop: 8, marginBottom: 4, paddingLeft: 20 }}>
        {visible.map((occ) => (
          <li key={occ.date} style={{ marginBottom: 4 }}>
            {occurrenceLabel(occ)}
            {occ.note && <span style={{ color: 'var(--ion-color-medium)' }}> — {occ.note}</span>}
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <IonButton fill="clear" size="small" onClick={() => setShowAll(true)}>
          +{remaining} more {remaining === 1 ? 'date' : 'dates'}
        </IonButton>
      )}
    </>
  )
}
