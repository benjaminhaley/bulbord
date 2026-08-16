import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonSpinner, IonToast } from '@ionic/react'
import { chevronBack, chevronForward } from 'ionicons/icons'
import { useEffect, useMemo, useState } from 'react'

import { fetchEventsForWeek, type Event, type EventFilters, type InterestStatus } from './api'
import { closeSliding, EventRow, TOAST_MESSAGES, type SwipeToast } from './EventsPage'
import { useEventInterest } from './useEventInterest'

function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfWeekSunday(date: Date): Date {
  return addDays(date, -date.getDay())
}

function weekdayAbbrev(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { weekday: 'short' })
}

function dayNumber(iso: string): number {
  return parseISODate(iso).getDate()
}

function dayHeading(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function weekRangeLabel(weekStart: string): string {
  const start = parseISODate(weekStart)
  const end = addDays(start, 6)
  const sameMonth = start.getMonth() === end.getMonth()
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

// Feedback #97: every real occurrence in a Sunday-Saturday week (not the
// next-occurrence-collapsed set the List view shows — see
// api/src/events/week-query.ts), as a swipeable strip + agenda list. Reuses
// EventsPage.tsx's own EventRow/swipe-undo-toast machinery so starring/
// dismissing works identically here, but keeps its own independent fetch
// and local state — this view and the List view are separate fetches of
// overlapping data, not a shared store, so switching between them can show
// a brief refetch rather than staying perfectly in sync moment-to-moment
// (acceptable: they're two views of the same underlying data, re-synced on
// every fetch, not a case where staleness could mislead about something
// that matters).
export function CalendarWeekView({ filters, multiTouch }: { filters: EventFilters; multiTouch: boolean }) {
  const [weekStart, setWeekStart] = useState(() => toISODate(startOfWeekSunday(new Date())))
  const [weekEvents, setWeekEvents] = useState<Event[] | null>(null)
  const [error, setError] = useState(false)
  const [swipeToast, setSwipeToast] = useState<SwipeToast | null>(null)
  const { setInterest, clearInterest } = useEventInterest(updateEvent)

  const topicsKey = filters.topics?.join(',') ?? ''
  useEffect(() => {
    setWeekEvents(null)
    setError(false)
    fetchEventsForWeek(weekStart, filters)
      .then(setWeekEvents)
      .catch(() => setError(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, topicsKey, filters.beforeTime])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => toISODate(addDays(parseISODate(weekStart), i))), [weekStart])
  const today = toISODate(new Date())

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>()
    for (const day of days) map.set(day, [])
    for (const event of weekEvents ?? []) {
      map.get(event.start_date)?.push(event)
    }
    return map
  }, [weekEvents, days])

  function updateEvent(updated: Event) {
    setWeekEvents((prev) => prev?.map((e) => (e.id === updated.id ? updated : e)) ?? null)
  }

  function handleSwipe(e: { target: EventTarget | null }, event: Event, status: InterestStatus) {
    closeSliding(e.target)
    setSwipeToast({ event, previousStatus: event.interest_status, newStatus: status })
    setInterest(event, status)
  }

  function undoSwipe() {
    if (!swipeToast) return
    const { event, previousStatus } = swipeToast
    if (previousStatus === null) {
      clearInterest(event)
    } else {
      setInterest(event, previousStatus)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 4px' }}>
        <IonButton fill="clear" onClick={() => setWeekStart((prev) => toISODate(addDays(parseISODate(prev), -7)))} aria-label="Previous week">
          <IonIcon slot="icon-only" icon={chevronBack} />
        </IonButton>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '0.8125rem', color: 'var(--ion-color-medium)' }}>
          {weekRangeLabel(weekStart)}
        </div>
        <IonButton fill="clear" onClick={() => setWeekStart((prev) => toISODate(addDays(parseISODate(prev), 7)))} aria-label="Next week">
          <IonIcon slot="icon-only" icon={chevronForward} />
        </IonButton>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px 8px' }}>
        {days.map((day) => {
          const hasEvents = (eventsByDay.get(day)?.length ?? 0) > 0
          const isToday = day === today
          return (
            <div key={day} style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: '0.6875rem', color: 'var(--ion-color-medium)' }}>{weekdayAbbrev(day)}</div>
              <div
                style={{
                  fontSize: '0.9375rem',
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'var(--ion-color-primary)' : undefined,
                }}
              >
                {dayNumber(day)}
              </div>
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  margin: '3px auto 0',
                  background: hasEvents ? 'var(--ion-color-primary)' : 'transparent',
                }}
              />
            </div>
          )
        })}
      </div>

      {weekEvents === null && !error && (
        <div className="coming-soon">
          <IonSpinner name="dots" />
        </div>
      )}
      {error && (
        <div className="coming-soon">
          <p>Coming soon</p>
        </div>
      )}
      {weekEvents !== null && weekEvents.length === 0 && (
        <div className="coming-soon">
          <p>No events this week</p>
        </div>
      )}
      {weekEvents !== null && weekEvents.length > 0 && (
        <IonList>
          {days.map((day) => {
            const dayEvents = eventsByDay.get(day) ?? []
            if (dayEvents.length === 0) return null
            return (
              <div key={day}>
                <IonItem lines="none">
                  <IonLabel color="medium">{dayHeading(day)}</IonLabel>
                </IonItem>
                {dayEvents.map((event) => (
                  <EventRow key={event.id} event={event} multiTouch={multiTouch} onSwipe={handleSwipe} />
                ))}
              </div>
            )
          })}
        </IonList>
      )}
      <IonToast
        isOpen={!!swipeToast}
        message={swipeToast ? TOAST_MESSAGES[swipeToast.newStatus] : ''}
        duration={3000}
        position="bottom"
        positionAnchor="main-tab-bar"
        buttons={[{ text: 'Undo', handler: undoSwipe }]}
        onDidDismiss={() => setSwipeToast(null)}
      />
    </>
  )
}
