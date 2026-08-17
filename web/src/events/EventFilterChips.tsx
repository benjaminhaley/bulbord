import { IonButton, IonCheckbox, IonChip, IonIcon, IonItem, IonLabel, IonModal, IonRange } from '@ionic/react'
import { chevronDownOutline, eyeOffOutline, sparkles, star } from 'ionicons/icons'
import { useState } from 'react'

import type { EventFilters } from './api'
import { EVENT_TOPIC_OPTIONS } from './topics'

// "9pm" — a short chip/pin label, not the fuller "9:00 pm" house style used
// elsewhere (events/format.ts's formatTime) — a filter chip/slider pin has
// room for a glance, not a sentence.
function shortTimeLabel(hhmm: string): string {
  const [hourStr, minuteStr] = hhmm.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  const isPM = hour >= 12
  const minutePart = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`
  return `${hour12}${minutePart}${isPM ? 'pm' : 'am'}`
}

const DAY_START_MIN = 0
const DAY_END_MIN = 24 * 60

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(min: number): string {
  const h = String(Math.floor(min / 60) % 24).padStart(2, '0')
  const m = String(min % 60).padStart(2, '0')
  return `${h}:${m}`
}

function minutesToPinLabel(min: number): string {
  if (min >= DAY_END_MIN) return '12am'
  return shortTimeLabel(minutesToTime(min))
}

function percentFor(value: number): number {
  return ((value - DAY_START_MIN) / (DAY_END_MIN - DAY_START_MIN)) * 100
}

// Anchors a label to whichever side keeps it fully on screen — centered in
// the middle of the track, but flush-left near the left edge and flush-right
// near the right edge, so it can never render partially off the visible
// sheet the way IonRange's own built-in `pin` did (see this component's own
// header comment for why the built-in pin was dropped entirely).
function labelTransform(percent: number): string {
  if (percent < 12) return 'translateX(0%)'
  if (percent > 88) return 'translateX(-100%)'
  return 'translateX(-50%)'
}

// Feedback, 2026-08-17 ("make sure the times always appear... they don't
// appear when you first open it... unless you've just moved one of the
// dots... it's getting cut off"): IonRange's built-in `pin` only renders
// while a knob is actively being dragged, and — being absolutely positioned
// relative to the knob itself with no awareness of the sheet's own
// boundaries — can render partly above or beside the visible sheet content.
// These labels are real React-rendered content instead (always visible,
// contribute to normal document flow, can't be clipped by an overlay
// z-index/bounds issue), positioned by percentage along the same
// horizontally-padded track HoursSheet wraps them in.
function RangeLabels({ lower, upper }: { lower: number; upper: number }) {
  function pillStyle(value: number): React.CSSProperties {
    return {
      position: 'absolute',
      top: 0,
      left: `${percentFor(value)}%`,
      transform: labelTransform(percentFor(value)),
      background: 'var(--ion-color-primary)',
      color: 'var(--ion-color-primary-contrast)',
      fontSize: '0.75rem',
      fontWeight: 600,
      padding: '2px 6px',
      borderRadius: 6,
      whiteSpace: 'nowrap',
    }
  }

  return (
    <div style={{ position: 'relative', height: 22 }}>
      <span style={pillStyle(lower)}>{minutesToPinLabel(lower)}</span>
      <span style={pillStyle(upper)}>{minutesToPinLabel(upper)}</span>
    </div>
  )
}

interface CheckboxOption {
  value: string
  label: string
  icon?: string
  iconColor?: string
}

// Feedback (2026-08-17, from a Google Maps screenshot): "Topic [and Hours]
// with that down carrot... when you click it, you [get] a little pop-up at
// the bottom that you could slide back down" — a chip with a chevron opens
// a real Ionic sheet modal (breakpoints/handle, native swipe-to-dismiss).
// Shared by Topic and, as of the same day, Interest (see EventsPage.tsx —
// "make interest one of the selectable dropdowns") — both are plain
// multi-select checkbox lists, just with different option sets and
// "Clear" semantics (Topic clears to no filter at all; Interest clears
// back to its own meaningful default, not to an empty/show-nothing set).
function CheckboxSheet({
  isOpen,
  onDismiss,
  title,
  options,
  selected,
  onChange,
  clearValue,
  breakpoint = 0.5,
}: {
  isOpen: boolean
  onDismiss: () => void
  title: string
  options: CheckboxOption[]
  selected: string[]
  onChange: (next: string[]) => void
  clearValue: string[]
  breakpoint?: number
}) {
  function toggle(value: string, checked: boolean) {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value))
  }

  const isCleared = selected.length === clearValue.length && clearValue.every((v) => selected.includes(v))

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss} breakpoints={[0, breakpoint]} initialBreakpoint={breakpoint} handle>
      <div style={{ padding: '8px 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: '0 0 8px' }}>{title}</h2>
          {!isCleared && (
            <IonButton fill="clear" size="small" onClick={() => onChange(clearValue)}>
              Clear
            </IonButton>
          )}
        </div>
        {options.map((option) => (
          <IonItem key={option.value} lines="none" style={{ '--padding-start': '0' } as React.CSSProperties}>
            <IonCheckbox checked={selected.includes(option.value)} onIonChange={(e) => toggle(option.value, e.detail.checked)}>
              {option.icon && (
                <IonIcon icon={option.icon} color={option.iconColor} style={{ marginInlineEnd: 8, verticalAlign: 'middle' }} />
              )}
              {option.label}
            </IonCheckbox>
          </IonItem>
        ))}
      </div>
    </IonModal>
  )
}

function HoursSheet({
  isOpen,
  onDismiss,
  afterTime,
  beforeTime,
  onChange,
}: {
  isOpen: boolean
  onDismiss: () => void
  afterTime: string
  beforeTime: string
  onChange: (afterTime: string, beforeTime: string) => void
}) {
  const lower = afterTime ? timeToMinutes(afterTime) : DAY_START_MIN
  const upper = beforeTime ? timeToMinutes(beforeTime) : DAY_END_MIN
  const rangeLabel = !afterTime && !beforeTime ? 'Any time' : `${minutesToPinLabel(lower)} – ${minutesToPinLabel(upper)}`

  function handleChange(value: { lower: number; upper: number }) {
    onChange(value.lower <= DAY_START_MIN ? '' : minutesToTime(value.lower), value.upper >= DAY_END_MIN ? '' : minutesToTime(value.upper))
  }

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss} breakpoints={[0, 0.4]} initialBreakpoint={0.4} handle>
      <div style={{ padding: '8px 16px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: '0 0 4px' }}>Hours</h2>
          {(afterTime || beforeTime) && (
            <IonButton fill="clear" size="small" onClick={() => onChange('', '')}>
              Clear
            </IonButton>
          )}
        </div>
        <p style={{ margin: '0 0 8px', color: 'var(--ion-color-medium)' }}>{rangeLabel}</p>
        <div style={{ padding: '0 14px' }}>
          <RangeLabels lower={lower} upper={upper} />
          <IonRange
            dualKnobs
            min={DAY_START_MIN}
            max={DAY_END_MIN}
            step={30}
            snaps
            value={{ lower, upper }}
            onIonInput={(e) => handleChange(e.detail.value as { lower: number; upper: number })}
          />
        </div>
      </div>
    </IonModal>
  )
}

// EventsPage.tsx's own interest_status values, plus 'new' standing in for
// null (no swipe yet) — same vocabulary as the old Starred/New/Dismissed
// accordion labels, just as checkbox options instead of section headers.
const EVENT_INTEREST_OPTIONS: CheckboxOption[] = [
  { value: 'interested', label: 'Starred', icon: star, iconColor: 'warning' },
  { value: 'new', label: 'New', icon: sparkles },
  { value: 'dismissed', label: 'Dismissed', icon: eyeOffOutline, iconColor: 'medium' },
]

// "the default is everything but dismissed" (feedback, 2026-08-17).
export const DEFAULT_INTEREST_FILTER = ['interested', 'new']

export function EventFilterChips({
  filters,
  onChange,
  interest,
}: {
  filters: EventFilters
  onChange: (next: EventFilters) => void
  // Only meaningful for the List view — Calendar has no Starred/New/
  // Dismissed concept of its own to filter by (see EventsPage.tsx) — so
  // this chip only renders when a caller actually passes it.
  interest?: { value: string[]; onChange: (next: string[]) => void }
}) {
  const [topicSheetOpen, setTopicSheetOpen] = useState(false)
  const [hoursSheetOpen, setHoursSheetOpen] = useState(false)
  const [interestSheetOpen, setInterestSheetOpen] = useState(false)
  const topics = filters.topics ?? []
  const afterTime = filters.afterTime ?? ''
  const beforeTime = filters.beforeTime ?? ''

  const topicLabel = topics.length === 0 ? 'Topic' : topics.length === 1 ? topics[0] : `${topics.length} topics`
  const hoursLabel = !afterTime && !beforeTime ? 'Hours' : `${afterTime ? shortTimeLabel(afterTime) : '12am'}–${beforeTime ? shortTimeLabel(beforeTime) : '12am'}`
  const interestIsDefault =
    !!interest &&
    interest.value.length === DEFAULT_INTEREST_FILTER.length &&
    DEFAULT_INTEREST_FILTER.every((v) => interest.value.includes(v))
  const interestLabel = !interest || interestIsDefault ? 'Interest' : interest.value.length === 0 ? 'None' : interest.value.length === 3 ? 'All' : interest.value.length === 1 ? EVENT_INTEREST_OPTIONS.find((o) => o.value === interest.value[0])!.label : `${interest.value.length} selected`

  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 12px' }}>
      <IonChip outline={topics.length === 0} color={topics.length > 0 ? 'primary' : 'medium'} onClick={() => setTopicSheetOpen(true)}>
        <IonLabel>{topicLabel}</IonLabel>
        <IonIcon icon={chevronDownOutline} />
      </IonChip>
      <IonChip
        outline={!afterTime && !beforeTime}
        color={afterTime || beforeTime ? 'primary' : 'medium'}
        onClick={() => setHoursSheetOpen(true)}
      >
        <IonLabel>{hoursLabel}</IonLabel>
        <IonIcon icon={chevronDownOutline} />
      </IonChip>
      {interest && (
        <IonChip outline={interestIsDefault} color={interestIsDefault ? 'medium' : 'primary'} onClick={() => setInterestSheetOpen(true)}>
          <IonLabel>{interestLabel}</IonLabel>
          <IonIcon icon={chevronDownOutline} />
        </IonChip>
      )}

      <CheckboxSheet
        isOpen={topicSheetOpen}
        onDismiss={() => setTopicSheetOpen(false)}
        title="Topic"
        options={EVENT_TOPIC_OPTIONS.map((topic) => ({ value: topic, label: topic }))}
        selected={topics}
        onChange={(next) => onChange({ ...filters, topics: next })}
        clearValue={[]}
      />
      <HoursSheet
        isOpen={hoursSheetOpen}
        onDismiss={() => setHoursSheetOpen(false)}
        afterTime={afterTime}
        beforeTime={beforeTime}
        onChange={(nextAfter, nextBefore) => onChange({ ...filters, afterTime: nextAfter, beforeTime: nextBefore })}
      />
      {interest && (
        <CheckboxSheet
          isOpen={interestSheetOpen}
          onDismiss={() => setInterestSheetOpen(false)}
          title="Interest"
          options={EVENT_INTEREST_OPTIONS}
          selected={interest.value}
          onChange={interest.onChange}
          clearValue={DEFAULT_INTEREST_FILTER}
        />
      )}
    </div>
  )
}
