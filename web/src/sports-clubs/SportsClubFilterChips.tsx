// Own copy of events/EventFilterChips.tsx's chip-opens-a-sheet-modal pattern
// (feedback #97, 2026-08-17, from a Google Maps screenshot) — not imported
// from events/, per this feature's fresh-non-shared-clone posture
// (CLAUDE.md). Two chips: Topic (the existing category field, reusing
// CATEGORY_OPTIONS/matchesCategoryFilter) and Schedule (day-of-week +
// time-of-day bucket, feedback 2026-08-19), each a plain multi-select
// checkbox sheet — no Hours-style range slider, since Sports & Clubs'
// schedule filter is deliberately bucketed rather than continuous.
import { IonButton, IonCheckbox, IonChip, IonIcon, IonItem, IonLabel, IonModal } from '@ionic/react'
import { chevronDownOutline } from 'ionicons/icons'
import { useState } from 'react'

import { CATEGORY_OPTIONS } from './format'
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

function TopicSheet({
  isOpen,
  onDismiss,
  selected,
  onChange,
}: {
  isOpen: boolean
  onDismiss: () => void
  selected: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss} breakpoints={[0, 0.5]} initialBreakpoint={0.5} handle>
      <div style={{ padding: '8px 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: '0 0 8px' }}>Topic</h2>
          {selected.length > 0 && (
            <IonButton fill="clear" size="small" onClick={() => onChange([])}>
              Clear
            </IonButton>
          )}
        </div>
        <CheckboxGroup options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))} selected={selected} onChange={onChange} />
      </div>
    </IonModal>
  )
}

function ScheduleSheet({
  isOpen,
  onDismiss,
  days,
  times,
  onChange,
}: {
  isOpen: boolean
  onDismiss: () => void
  days: ScheduleDay[]
  times: TimeOfDayBucket[]
  onChange: (days: ScheduleDay[], times: TimeOfDayBucket[]) => void
}) {
  const isCleared = days.length === 0 && times.length === 0

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss} breakpoints={[0, 0.65]} initialBreakpoint={0.65} handle>
      <div style={{ padding: '8px 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: '0 0 8px' }}>Schedule</h2>
          {!isCleared && (
            <IonButton fill="clear" size="small" onClick={() => onChange([], [])}>
              Clear
            </IonButton>
          )}
        </div>
        <h3 style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--ion-color-medium)' }}>Day of week</h3>
        <CheckboxGroup options={DAY_OPTIONS} selected={days} onChange={(next) => onChange(next, times)} />
        <h3 style={{ margin: '16px 0 0', fontSize: '0.9rem', color: 'var(--ion-color-medium)' }}>Time of day</h3>
        <CheckboxGroup options={TIME_OF_DAY_OPTIONS} selected={times} onChange={(next) => onChange(days, next)} />
      </div>
    </IonModal>
  )
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
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false)

  const { categories, days, times } = filters
  const topicLabel = categories.length === 0 ? 'Topic' : categories.length === 1 ? categories[0] : `${categories.length} topics`
  const scheduleActive = days.length > 0 || times.length > 0
  const scheduleLabel = !scheduleActive ? 'Schedule' : `${days.length + times.length} selected`

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
      <IonChip
        outline={!scheduleActive}
        color={scheduleActive ? 'primary' : 'medium'}
        onClick={() => setScheduleSheetOpen(true)}
        style={chipStyle}
      >
        <IonLabel style={labelStyle}>{scheduleLabel}</IonLabel>
        <IonIcon icon={chevronDownOutline} />
      </IonChip>

      <TopicSheet
        isOpen={topicSheetOpen}
        onDismiss={() => setTopicSheetOpen(false)}
        selected={categories}
        onChange={(next) => onChange({ ...filters, categories: next })}
      />
      <ScheduleSheet
        isOpen={scheduleSheetOpen}
        onDismiss={() => setScheduleSheetOpen(false)}
        days={days}
        times={times}
        onChange={(nextDays, nextTimes) => onChange({ ...filters, days: nextDays, times: nextTimes })}
      />
    </div>
  )
}
