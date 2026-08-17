import { IonButton, IonCheckbox, IonChip, IonIcon, IonItem, IonLabel, IonModal, IonRange } from '@ionic/react'
import { chevronDownOutline } from 'ionicons/icons'
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

// Feedback (2026-08-17, from a Google Maps screenshot): "Topic [and Hours]
// with that down carrot... when you click it, you [get] a little pop-up at
// the bottom that you could slide back down" — both filters are now a chip
// with a chevron that opens a real Ionic sheet modal (breakpoints/handle,
// native swipe-to-dismiss), replacing the earlier always-expanded checkbox
// row and small time popover.
function TopicSheet({
  isOpen,
  onDismiss,
  topics,
  onChange,
}: {
  isOpen: boolean
  onDismiss: () => void
  topics: string[]
  onChange: (topics: string[]) => void
}) {
  function toggle(topic: string, checked: boolean) {
    onChange(checked ? [...topics, topic] : topics.filter((t) => t !== topic))
  }

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss} breakpoints={[0, 0.5]} initialBreakpoint={0.5} handle>
      <div style={{ padding: '8px 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: '0 0 8px' }}>Topic</h2>
          {topics.length > 0 && (
            <IonButton fill="clear" size="small" onClick={() => onChange([])}>
              Clear
            </IonButton>
          )}
        </div>
        {EVENT_TOPIC_OPTIONS.map((topic) => (
          <IonItem key={topic} lines="none" style={{ '--padding-start': '0' } as React.CSSProperties}>
            <IonCheckbox checked={topics.includes(topic)} onIonChange={(e) => toggle(topic, e.detail.checked)}>
              {topic}
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
        <IonRange
          dualKnobs
          min={DAY_START_MIN}
          max={DAY_END_MIN}
          step={30}
          snaps
          value={{ lower, upper }}
          pinFormatter={minutesToPinLabel}
          pin
          onIonInput={(e) => handleChange(e.detail.value as { lower: number; upper: number })}
        />
      </div>
    </IonModal>
  )
}

export function EventFilterChips({ filters, onChange }: { filters: EventFilters; onChange: (next: EventFilters) => void }) {
  const [topicSheetOpen, setTopicSheetOpen] = useState(false)
  const [hoursSheetOpen, setHoursSheetOpen] = useState(false)
  const topics = filters.topics ?? []
  const afterTime = filters.afterTime ?? ''
  const beforeTime = filters.beforeTime ?? ''

  const topicLabel = topics.length === 0 ? 'Topic' : topics.length === 1 ? topics[0] : `${topics.length} topics`
  const hoursLabel = !afterTime && !beforeTime ? 'Hours' : `${afterTime ? shortTimeLabel(afterTime) : '12am'}–${beforeTime ? shortTimeLabel(beforeTime) : '12am'}`

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

      <TopicSheet
        isOpen={topicSheetOpen}
        onDismiss={() => setTopicSheetOpen(false)}
        topics={topics}
        onChange={(next) => onChange({ ...filters, topics: next })}
      />
      <HoursSheet
        isOpen={hoursSheetOpen}
        onDismiss={() => setHoursSheetOpen(false)}
        afterTime={afterTime}
        beforeTime={beforeTime}
        onChange={(nextAfter, nextBefore) => onChange({ ...filters, afterTime: nextAfter, beforeTime: nextBefore })}
      />
    </div>
  )
}
