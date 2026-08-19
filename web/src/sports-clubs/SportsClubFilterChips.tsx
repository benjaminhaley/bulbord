// Own copy of events/EventFilterChips.tsx's chip-opens-a-sheet-modal pattern
// (feedback #97, 2026-08-17, from a Google Maps screenshot) — not imported
// from events/, per this feature's fresh-non-shared-clone posture
// (CLAUDE.md). Three chips: Topic (the existing category field, reusing
// CATEGORY_OPTIONS/matchesCategoryFilter), Day, and Time (feedback
// 2026-08-19 — originally one combined "Schedule" chip, split apart the
// same day into two independent filters so either can be applied without
// implying the other), each a plain multi-select checkbox sheet — no
// Hours-style range slider, since the Time filter is deliberately bucketed
// rather than continuous.
import { IonButton, IonCheckbox, IonChip, IonContent, IonIcon, IonItem, IonLabel, IonModal } from '@ionic/react'
import { chevronDownOutline } from 'ionicons/icons'
import { useState } from 'react'

import { CATEGORY_OPTIONS, categoryLabel } from './format'
import { DAY_OPTIONS, TIME_OF_DAY_OPTIONS, type ScheduleDay, type TimeOfDayBucket } from './filters'

interface CheckboxOption<T extends string | number> {
  value: T
  label: string
}

function CheckboxGroup<T extends string | number>({
  options,
  selected,
  onChange,
}: {
  options: CheckboxOption<T>[]
  selected: T[]
  onChange: (next: T[]) => void
}) {
  function toggle(value: T, checked: boolean) {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value))
  }

  return (
    <>
      {options.map((option) => (
        <IonItem key={option.value} lines="none" style={{ '--padding-start': '0' } as React.CSSProperties}>
          <IonCheckbox checked={selected.includes(option.value)} onIonChange={(e) => toggle(option.value, e.detail.checked)}>
            {option.label}
          </IonCheckbox>
        </IonItem>
      ))}
    </>
  )
}

// Shared by Topic/Day/Time — a title, a Clear button (shown only once
// something's selected), and a scrollable checkbox list. IonContent (not a
// bare div) is what actually lets the list scroll within whatever height
// the dragged-to breakpoint leaves it (feedback, 2026-08-19: Topic's own 7
// options used to just clip with no way to reach the last few) — the
// standard Ionic pattern for variable-length sheet content; the title/Clear
// row stays outside it so it never scrolls out of view itself.
function SingleGroupSheet<T extends string | number>({
  isOpen,
  onDismiss,
  title,
  options,
  selected,
  onChange,
  breakpoint = 0.5,
}: {
  isOpen: boolean
  onDismiss: () => void
  title: string
  options: CheckboxOption<T>[]
  selected: T[]
  onChange: (next: T[]) => void
  breakpoint?: number
}) {
  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss} breakpoints={[0, breakpoint, 0.9]} initialBreakpoint={breakpoint} handle>
      <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: '0 0 8px' }}>{title}</h2>
        {selected.length > 0 && (
          <IonButton fill="clear" size="small" onClick={() => onChange([])}>
            Clear
          </IonButton>
        )}
      </div>
      <IonContent className="ion-padding-horizontal">
        <CheckboxGroup options={options} selected={selected} onChange={onChange} />
      </IonContent>
    </IonModal>
  )
}

// Short, chip-sized labels for the Time-of-day options — TIME_OF_DAY_OPTIONS'
// own labels carry a parenthetical range ("Morning (before 12pm)") that's
// useful inside the sheet but too long once a single selection needs to
// render inline on the chip itself.
const TIME_SHORT_LABELS: Record<TimeOfDayBucket, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

export interface SportsClubFilters {
  categories: string[]
  days: ScheduleDay[]
  times: TimeOfDayBucket[]
}

export const DEFAULT_SPORTS_CLUB_FILTERS: SportsClubFilters = { categories: [], days: [], times: [] }

export function SportsClubFilterChips({
  filters,
  onChange,
}: {
  filters: SportsClubFilters
  onChange: (next: SportsClubFilters) => void
}) {
  const [topicSheetOpen, setTopicSheetOpen] = useState(false)
  const [daySheetOpen, setDaySheetOpen] = useState(false)
  const [timeSheetOpen, setTimeSheetOpen] = useState(false)

  const { categories, days, times } = filters
  const topicLabel =
    categories.length === 0 ? 'Topic' : categories.length === 1 ? categoryLabel(categories[0]) : `${categories.length} topics`
  const dayLabel =
    days.length === 0 ? 'Day' : days.length === 1 ? DAY_OPTIONS.find((o) => o.value === days[0])!.label : `${days.length} days`
  const timeLabel = times.length === 0 ? 'Time' : times.length === 1 ? TIME_SHORT_LABELS[times[0]] : `${times.length} times`

  const chipStyle: React.CSSProperties = { flexShrink: 0 }
  const labelStyle: React.CSSProperties = { whiteSpace: 'nowrap' }

  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 12px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <IonChip
        outline={categories.length === 0}
        color={categories.length > 0 ? 'primary' : 'medium'}
        onClick={() => setTopicSheetOpen(true)}
        style={chipStyle}
      >
        <IonLabel style={labelStyle}>{topicLabel}</IonLabel>
        <IonIcon icon={chevronDownOutline} />
      </IonChip>
      <IonChip outline={days.length === 0} color={days.length > 0 ? 'primary' : 'medium'} onClick={() => setDaySheetOpen(true)} style={chipStyle}>
        <IonLabel style={labelStyle}>{dayLabel}</IonLabel>
        <IonIcon icon={chevronDownOutline} />
      </IonChip>
      <IonChip
        outline={times.length === 0}
        color={times.length > 0 ? 'primary' : 'medium'}
        onClick={() => setTimeSheetOpen(true)}
        style={chipStyle}
      >
        <IonLabel style={labelStyle}>{timeLabel}</IonLabel>
        <IonIcon icon={chevronDownOutline} />
      </IonChip>

      <SingleGroupSheet
        isOpen={topicSheetOpen}
        onDismiss={() => setTopicSheetOpen(false)}
        title="Topic"
        options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: categoryLabel(c) }))}
        selected={categories}
        onChange={(next) => onChange({ ...filters, categories: next })}
        breakpoint={0.5}
      />
      <SingleGroupSheet
        isOpen={daySheetOpen}
        onDismiss={() => setDaySheetOpen(false)}
        title="Day of week"
        options={DAY_OPTIONS}
        selected={days}
        onChange={(next) => onChange({ ...filters, days: next })}
        breakpoint={0.55}
      />
      <SingleGroupSheet
        isOpen={timeSheetOpen}
        onDismiss={() => setTimeSheetOpen(false)}
        title="Time of day"
        options={TIME_OF_DAY_OPTIONS}
        selected={times}
        onChange={(next) => onChange({ ...filters, times: next })}
        breakpoint={0.35}
      />
    </div>
  )
}
