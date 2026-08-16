import { IonChip, IonIcon, IonLabel, IonPopover } from '@ionic/react'
import { closeCircle, timeOutline } from 'ionicons/icons'
import { useState } from 'react'

import type { EventFilters } from './api'
import { EVENT_TOPIC_OPTIONS } from './topics'

// "9pm" — a short chip label, not the fuller "9:00 pm" house style used
// elsewhere (events/format.ts's formatTime) — a filter chip has room for a
// glance, not a sentence.
function shortTimeLabel(hhmm: string): string {
  const [hourStr, minuteStr] = hhmm.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  const isPM = hour >= 12
  const minutePart = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`
  return `${hour12}${minutePart}${isPM ? 'pm' : 'am'}`
}

// Feedback (2026-08-16, after the original IonModal-based filter sheet
// shipped): "filters are clunky... base it on a more modern app like Google
// Maps" — replaced with a horizontally-scrollable row of instant-apply
// filter chips (Google Maps' own restaurant-search filter row is exactly
// this shape: tap a chip to toggle it, no separate Apply/Clear step). Topic
// chips toggle directly; the one filter that isn't a simple boolean (a time
// cutoff) gets its own chip that opens a small anchored popover, still
// applying live on change rather than needing a confirm button.
export function EventFilterChips({ filters, onChange }: { filters: EventFilters; onChange: (next: EventFilters) => void }) {
  const [timePopoverOpen, setTimePopoverOpen] = useState(false)
  const topics = filters.topics ?? []
  const beforeTime = filters.beforeTime ?? ''
  const hasBeforeTime = !!beforeTime
  const hasAnyFilter = topics.length > 0 || hasBeforeTime

  function toggleTopic(topic: string) {
    const next = topics.includes(topic) ? topics.filter((t) => t !== topic) : [...topics, topic]
    onChange({ ...filters, topics: next })
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        padding: '6px 12px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {EVENT_TOPIC_OPTIONS.map((topic) => {
        const active = topics.includes(topic)
        return (
          <IonChip
            key={topic}
            outline={!active}
            color={active ? 'primary' : 'medium'}
            onClick={() => toggleTopic(topic)}
            style={{ flexShrink: 0, margin: 0 }}
          >
            <IonLabel>{topic}</IonLabel>
          </IonChip>
        )
      })}
      <IonChip
        id="event-time-filter-chip"
        outline={!hasBeforeTime}
        color={hasBeforeTime ? 'primary' : 'medium'}
        onClick={() => setTimePopoverOpen(true)}
        style={{ flexShrink: 0, margin: 0 }}
      >
        <IonIcon icon={timeOutline} />
        <IonLabel>{hasBeforeTime ? `Before ${shortTimeLabel(beforeTime)}` : 'Time'}</IonLabel>
      </IonChip>
      {hasAnyFilter && (
        <IonChip onClick={() => onChange({ topics: [], beforeTime: '' })} style={{ flexShrink: 0, margin: 0 }}>
          <IonIcon icon={closeCircle} color="medium" />
          <IonLabel color="medium">Clear</IonLabel>
        </IonChip>
      )}
      <IonPopover
        trigger="event-time-filter-chip"
        isOpen={timePopoverOpen}
        onDidDismiss={() => setTimePopoverOpen(false)}
      >
        <div style={{ padding: 16, minWidth: 220 }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.8125rem', color: 'var(--ion-color-medium)' }}>Hide events starting after</p>
          <input
            type="time"
            value={beforeTime}
            onChange={(e) => onChange({ ...filters, beforeTime: e.target.value })}
            style={{ border: 'none', font: 'inherit', fontSize: '1.25rem', width: '100%', padding: '4px 0', background: 'transparent' }}
            autoFocus
          />
          {hasBeforeTime && (
            <IonChip
              onClick={() => {
                onChange({ ...filters, beforeTime: '' })
                setTimePopoverOpen(false)
              }}
              style={{ margin: '8px 0 0' }}
            >
              <IonIcon icon={closeCircle} color="medium" />
              <IonLabel color="medium">Clear time</IonLabel>
            </IonChip>
          )}
        </div>
      </IonPopover>
    </div>
  )
}
