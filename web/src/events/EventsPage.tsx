import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
  useIonViewWillEnter,
} from '@ionic/react'
import { addOutline, eyeOffOutline, filterOutline, star } from 'ionicons/icons'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import { InstitutionBanner } from '../app/InstitutionBanner'
import { API_URL } from '../config'
import { Avatar } from '../uploads/Avatar'
import { AddEventModal } from './AddEventModal'
import { CalendarWeekView } from './CalendarWeekView'
import { DEFAULT_INTEREST_FILTER, EventFilterChips } from './EventFilterChips'
import { fetchEvents, type Event, type EventFilters, type InterestStatus } from './api'
import { formatWhen, locationLabel, teaser } from './format'
import { InterestedBadge } from './InterestedBadge'
import { useEventInterest } from './useEventInterest'

// What to show in the undo toast after a swipe, and what to restore if the
// user taps Undo — the status the event had immediately before the swipe.
// Exported for CalendarWeekView.tsx's own independent swipe/undo handling.
export interface SwipeToast {
  event: Event
  previousStatus: InterestStatus | null
  newStatus: InterestStatus
}

export const TOAST_MESSAGES: Record<InterestStatus, string> = {
  interested: 'Marked interested',
  dismissed: 'Dismissed',
}

export function closeSliding(target: EventTarget | null) {
  const sliding = (target as HTMLElement | null)?.closest('ion-item-sliding') as HTMLIonItemSlidingElement | null
  sliding?.close()
}

// Extracted so the same swipeable row renders in the Starred/New accordion
// sections, the "Show N dismissed events" reveal below them (feedback #60,
// replacing the old New/Starred/Dismissed segmented tabs), and — exported —
// the calendar week view's own agenda list (feedback #97, CalendarWeekView.tsx).
export function EventRow({
  event,
  multiTouch,
  onSwipe,
  dimmed,
}: {
  event: Event
  multiTouch: boolean
  onSwipe: (e: { target: EventTarget | null }, event: Event, status: InterestStatus) => void
  dimmed?: boolean
}) {
  const location = locationLabel({ locationName: event.location_name, address: event.address })
  const description = teaser(event.description)

  return (
    <IonItemSliding disabled={multiTouch}>
      <IonItemOptions side="start" onIonSwipe={(e) => onSwipe(e, event, 'interested')}>
        <IonItemOption expandable color="warning" onClick={(e) => onSwipe(e, event, 'interested')}>
          <IonIcon slot="icon-only" icon={star} />
        </IonItemOption>
      </IonItemOptions>
      <IonItem routerLink={`/events/${event.id}`} style={dimmed ? { opacity: 0.55 } : undefined}>
        {event.thumbnail_url ? (
          <img
            src={`${API_URL}${event.thumbnail_url}`}
            alt=""
            slot="start"
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }}
          />
        ) : (
          event.submitted_by && <Avatar url={event.submitted_by.avatar_url} name={event.submitted_by.name} size={56} slot="start" />
        )}
        <IonLabel>
          <h2>
            {event.title}
            {dimmed && <IonNote style={{ marginLeft: 6, fontSize: '0.75em', textTransform: 'uppercase' }}>Dismissed</IonNote>}
          </h2>
          <p>
            {formatWhen({ startDate: event.start_date, startTime: event.start_time, endTime: event.end_time, allDay: event.all_day })}
          </p>
          {location && <IonNote>{location}</IonNote>}
          {description && <p className="teaser">{description}</p>}
          {event.interested_count > 0 && (
            <InterestedBadge eventId={event.id} count={event.interested_count} people={event.interested_people} />
          )}
        </IonLabel>
      </IonItem>
      <IonItemOptions side="end" onIonSwipe={(e) => onSwipe(e, event, 'dismissed')}>
        <IonItemOption expandable color="medium" onClick={(e) => onSwipe(e, event, 'dismissed')}>
          <IonIcon slot="icon-only" icon={eyeOffOutline} />
        </IonItemOption>
      </IonItemOptions>
    </IonItemSliding>
  )
}

export function EventsPage() {
  const { user } = useAuth()
  const [events, setEvents] = useState<Event[] | null>(null)
  const [error, setError] = useState(false)
  const [swipeToast, setSwipeToast] = useState<SwipeToast | null>(null)
  const [multiTouch, setMultiTouch] = useState(false)
  // Whether the full-screen add-event flow (AddEventModal.tsx) is open —
  // feedback, 2026-08-23: "you don't need to see existing events when
  // you're adding a new event," so this is a real modal now, not inline
  // content pushed above the list. The modal owns its own choice/
  // processing/form staging internally.
  const [showForm, setShowForm] = useState(false)
  // Occurrences the next-occurrence collapse is currently suppressing
  // (feedback #48) — 0 once revealHidden() below has fetched everything.
  const [hiddenCount, setHiddenCount] = useState(0)
  // Bumped whenever a new event is created, so CalendarWeekView — a fully
  // separate fetch/state from this page's own `events` (see that
  // component's own header comment) — knows to refetch too. Without this,
  // posting a new event while on Calendar view updated List's own state
  // (via onCreated below) but Calendar kept showing its last fetch until
  // something else changed weekStart/filters or the whole page reloaded
  // (feedback, 2026-09-05: "I just posted one, but it didn't appear
  // immediately... had to reload the page").
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)
  const { setInterest, clearInterest } = useEventInterest(updateEvent)

  // Feedback #97: List/Calendar view toggle, and the topic/time-cutoff
  // filters that apply to both. Neither is persisted across visits — a
  // fresh tab open always starts on List with no filters, same "no saved
  // per-user preference" posture as every other view-state in this app.
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [filters, setFilters] = useState<EventFilters>({ topics: [], afterTime: '', beforeTime: '' })
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Feedback (2026-08-17): "remove the accordion sections, just as you do
  // for the calendar view, and instead make interest one of the selectable
  // dropdowns, where the default is everything but dismissed" — replaces
  // the old Starred/New/Dismissed IonAccordionGroup entirely. A client-side
  // filter (not sent to the API) since interest_status is already present
  // on every fetched event, same reasoning Calendar's own view never needed
  // a server round-trip for this either.
  const [interestFilter, setInterestFilter] = useState<string[]>(DEFAULT_INTEREST_FILTER)
  const activeFilterCount =
    (filters.topics?.length ?? 0) +
    (filters.afterTime ? 1 : 0) +
    (filters.beforeTime ? 1 : 0) +
    (interestFilter.length !== DEFAULT_INTEREST_FILTER.length || !DEFAULT_INTEREST_FILTER.every((v) => interestFilter.includes(v)) ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0
  const didInitialFetch = useRef(false)

  function loadEvents() {
    fetchEvents({ topics: filters.topics, afterTime: filters.afterTime, beforeTime: filters.beforeTime })
      .then(({ events, hiddenCount }) => {
        setEvents(events)
        setHiddenCount(hiddenCount)
      })
      .catch(() => setError(true))
  }

  // Ionic keeps this page's React state alive (hidden, not unmounted) when
  // navigating to an event's detail page and back, for the back-swipe
  // transition — a plain useEffect(fn, []) would only ever run once and
  // never see an edit/delete made on the detail page. useIonViewWillEnter
  // fires on that initial mount too, so it fully replaces useEffect here,
  // not just supplements it.
  useIonViewWillEnter(() => {
    didInitialFetch.current = true
    loadEvents()
  })

  // Refetch the list whenever the filters change while already on this tab
  // — view-enter alone only catches re-entering the tab, not editing
  // filters mid-visit. Guarded so it doesn't also double-fire the very
  // first load, which useIonViewWillEnter above already handles.
  const topicsKey = filters.topics?.join(',') ?? ''
  useEffect(() => {
    if (!didInitialFetch.current) return
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicsKey, filters.afterTime, filters.beforeTime])

  function revealHidden() {
    fetchEvents({ includeHidden: true, topics: filters.topics, afterTime: filters.afterTime, beforeTime: filters.beforeTime })
      .then(({ events, hiddenCount }) => {
        setEvents(events)
        setHiddenCount(hiddenCount)
      })
      .catch(() => setError(true))
  }

  // 'new' stands in for interest_status === null (no swipe yet) — same
  // vocabulary EVENT_INTEREST_OPTIONS uses in the Interest sheet.
  const visibleEvents = useMemo(
    () => events?.filter((e) => interestFilter.includes(e.interest_status ?? 'new')) ?? [],
    [events, interestFilter],
  )

  function updateEvent(updated: Event) {
    setEvents((prev) => prev?.map((e) => (e.id === updated.id ? updated : e)) ?? null)
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

  // Ionic's item-sliding gesture reads raw touch movement without checking
  // how many fingers are down, so a two-finger pinch-to-zoom gets its first
  // finger's movement misread as a horizontal swipe. Disabling every sliding
  // item for as long as a second finger is on screen cleanly aborts any
  // in-progress swipe (IonItemSliding settles back to closed rather than
  // firing interested/dismissed) without touching Ionic itself or any other
  // page — this is the only screen with swipeable list items.
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length > 1) setMultiTouch(true)
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (e.touches.length === 0) setMultiTouch(false)
  }

  return (
    <IonPage>
      <IonHeader>
        <InstitutionBanner />
        <IonToolbar>
          <IonTitle>Events</IonTitle>
          <IonButtons slot="end">
            {/* Feedback (2026-08-17, "consolidate these icons"): the
                standalone calendar-toggle icon and the sources-list icon are
                both gone from this row — calendar folded into the filter
                chip row below ("make the calendar something in the filter
                view... one of the filters that can pop open"), sources moved
                to Developer Tools entirely (adding one is admin-only now).
                Filter is a pressed-state toggle (one static icon, colored
                primary only while active), plus a count badge so an applied
                filter is visible even while its chip row is collapsed. */}
            <IonButton onClick={() => setFiltersOpen((v) => !v)} aria-label="Toggle filters">
              <IonIcon slot="icon-only" icon={filterOutline} color={hasActiveFilters || filtersOpen ? 'primary' : undefined} />
              {hasActiveFilters && <IonBadge color="primary">{activeFilterCount}</IonBadge>}
            </IonButton>
            {/* Opens the full-screen AddEventModal below — its own header
                close button is how it closes now, not this icon (feedback,
                2026-08-23: the add flow is a real modal, not inline content
                on this page). */}
            {user && (
              <IonButton onClick={() => setShowForm(true)}>
                <IonIcon slot="icon-only" icon={addOutline} />
              </IonButton>
            )}
          </IonButtons>
        </IonToolbar>
        {/* Feedback (2026-08-16): "filters are clunky... base it on a more
            modern app like Google Maps" — a horizontally-scrollable row of
            instant-apply chips, replacing the earlier filter-button +
            IonModal sheet. Collapsed by default now (see the header-button
            comment above) — only rendered while filtersOpen. */}
        {filtersOpen && (
          <IonToolbar style={{ '--min-height': '40px', '--padding-start': '0', '--padding-end': '0' } as React.CSSProperties}>
            <EventFilterChips
              filters={filters}
              onChange={setFilters}
              view={{ value: viewMode, onChange: setViewMode }}
              interest={viewMode === 'list' ? { value: interestFilter, onChange: setInterestFilter } : undefined}
            />
          </IonToolbar>
        )}
      </IonHeader>
      <IonContent fullscreen onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
        <AddEventModal
          isOpen={showForm}
          onClose={() => setShowForm(false)}
          onCreated={(created) => {
            setEvents((prev) => [created, ...(prev ?? [])])
            setCalendarRefreshKey((k) => k + 1)
          }}
        />
        {viewMode === 'calendar' && <CalendarWeekView filters={filters} multiTouch={multiTouch} refreshKey={calendarRefreshKey} />}
        {viewMode === 'list' && events === null && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {viewMode === 'list' && error && (
          <div className="coming-soon">
            <p>Coming soon</p>
          </div>
        )}
        {viewMode === 'list' && events !== null && events.length === 0 && (
          <div className="coming-soon">
            <p>No upcoming events yet</p>
          </div>
        )}
        {/* Feedback (2026-08-17): "remove the accordion sections, just as
            you do for the calendar view" — a single flat, chronological
            list (same shape as CalendarWeekView's own agenda), filtered by
            the Interest chip's selection rather than split into separate
            Starred/New/Dismissed sections. */}
        {viewMode === 'list' && events !== null && events.length > 0 && (
          <IonList>
            {visibleEvents.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                multiTouch={multiTouch}
                onSwipe={handleSwipe}
                dimmed={event.interest_status === 'dismissed'}
              />
            ))}
            {visibleEvents.length === 0 && (
              <IonItem lines="none">
                <IonLabel className="ion-text-center" color="medium">
                  No events match your Interest filter
                </IonLabel>
              </IonItem>
            )}
            {hiddenCount > 0 && (
              <IonItem button lines="none" detail={false} onClick={revealHidden}>
                <IonLabel color="medium" className="ion-text-center">
                  Show {hiddenCount} hidden repeating {hiddenCount === 1 ? 'event' : 'events'}
                </IonLabel>
              </IonItem>
            )}
          </IonList>
        )}
      </IonContent>
      <IonToast
        isOpen={!!swipeToast}
        message={swipeToast ? TOAST_MESSAGES[swipeToast.newStatus] : ''}
        duration={3000}
        position="bottom"
        positionAnchor="main-tab-bar"
        buttons={[{ text: 'Undo', handler: undoSwipe }]}
        onDidDismiss={() => setSwipeToast(null)}
      />
    </IonPage>
  )
}
