import {
  IonAccordion,
  IonAccordionGroup,
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
import { addOutline, calendarOutline, closeOutline, eyeOffOutline, filterOutline, listOutline, sparkles, star } from 'ionicons/icons'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import { InstitutionBanner } from '../app/InstitutionBanner'
import { API_URL } from '../config'
import { Avatar } from '../uploads/Avatar'
import { CalendarWeekView } from './CalendarWeekView'
import { EventFilterChips } from './EventFilterChips'
import { createEvent, fetchEvents, type Event, type EventFilters, type InterestStatus } from './api'
import { EventForm } from './EventForm'
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
          <p>{formatWhen({ startDate: event.start_date, startTime: event.start_time, allDay: event.all_day })}</p>
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
  const [showForm, setShowForm] = useState(false)
  // Occurrences the next-occurrence collapse is currently suppressing
  // (feedback #48) — 0 once revealHidden() below has fetched everything.
  const [hiddenCount, setHiddenCount] = useState(0)
  // Which accordion section(s) start open — New by default, or Starred if
  // New is already empty ("complete") on first load (feedback, 2026-08-06).
  // Computed once per page visit, not re-derived every time the underlying
  // counts change (e.g. from swiping), so the user's own manual expand/
  // collapse choices aren't stomped mid-session.
  const [expandedSections, setExpandedSections] = useState<string[]>([])
  const hasSetDefaultExpansion = useRef(false)
  const { setInterest, clearInterest } = useEventInterest(updateEvent)

  // Feedback #97: List/Calendar view toggle, and the topic/time-cutoff
  // filters that apply to both. Neither is persisted across visits — a
  // fresh tab open always starts on List with no filters, same "no saved
  // per-user preference" posture as every other view-state in this app.
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [filters, setFilters] = useState<EventFilters>({ topics: [], beforeTime: '' })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilterCount = (filters.topics?.length ?? 0) + (filters.beforeTime ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0
  const didInitialFetch = useRef(false)

  function loadEvents() {
    fetchEvents({ topics: filters.topics, beforeTime: filters.beforeTime })
      .then(({ events, hiddenCount }) => {
        setEvents(events)
        setHiddenCount(hiddenCount)
        if (!hasSetDefaultExpansion.current) {
          hasSetDefaultExpansion.current = true
          const hasNew = events.some((e) => e.interest_status === null)
          setExpandedSections([hasNew ? 'new' : 'starred'])
        }
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
  }, [topicsKey, filters.beforeTime])

  function revealHidden() {
    fetchEvents({ includeHidden: true, topics: filters.topics, beforeTime: filters.beforeTime })
      .then(({ events, hiddenCount }) => {
        setEvents(events)
        setHiddenCount(hiddenCount)
      })
      .catch(() => setError(true))
  }

  const starredEvents = useMemo(() => events?.filter((e) => e.interest_status === 'interested') ?? [], [events])
  const newEvents = useMemo(() => events?.filter((e) => e.interest_status === null) ?? [], [events])
  const dismissedEvents = useMemo(() => events?.filter((e) => e.interest_status === 'dismissed') ?? [], [events])

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
            {/* Feedback (2026-08-17): the List/Calendar segment and the
                filter chip row each used to be their own full-width toolbar
                — "put the calendar toggle and filter toggle up here [next
                to the title]. Both should be out of the way like this."
                Both are now single icon buttons in the main toolbar, same
                row as the existing post/sources buttons — no permanent
                second/third row at all. Calendar is a pressed-state toggle
                (one static icon, colored primary only while active) rather
                than swapping icon+label, so it reads as "this view is on,"
                not "tap to see a different icon." Filter is the same
                pressed-state shape, plus a count badge so an applied filter
                is visible even while its chip row is collapsed. */}
            <IonButton onClick={() => setViewMode((v) => (v === 'list' ? 'calendar' : 'list'))} aria-label="Toggle calendar view">
              <IonIcon slot="icon-only" icon={calendarOutline} color={viewMode === 'calendar' ? 'primary' : undefined} />
            </IonButton>
            <IonButton onClick={() => setFiltersOpen((v) => !v)} aria-label="Toggle filters">
              <IonIcon slot="icon-only" icon={filterOutline} color={hasActiveFilters || filtersOpen ? 'primary' : undefined} />
              {hasActiveFilters && <IonBadge color="primary">{activeFilterCount}</IonBadge>}
            </IonButton>
            {user && (
              <IonButton onClick={() => setShowForm((v) => !v)}>
                <IonIcon slot="icon-only" icon={showForm ? closeOutline : addOutline} />
              </IonButton>
            )}
            <IonButton routerLink="/event-sources">
              <IonIcon slot="icon-only" icon={listOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
        {/* Feedback (2026-08-16): "filters are clunky... base it on a more
            modern app like Google Maps" — a horizontally-scrollable row of
            instant-apply chips, replacing the earlier filter-button +
            IonModal sheet. Collapsed by default now (see the header-button
            comment above) — only rendered while filtersOpen. */}
        {filtersOpen && (
          <IonToolbar style={{ '--min-height': '40px', '--padding-start': '0', '--padding-end': '0' } as React.CSSProperties}>
            <EventFilterChips filters={filters} onChange={setFilters} />
          </IonToolbar>
        )}
      </IonHeader>
      <IonContent fullscreen onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
        {showForm && (
          <EventForm
            submitLabel="Post"
            errorMessage="Could not post this event"
            onSubmit={async (input) => {
              const created = await createEvent(input)
              setEvents((prev) => [created, ...(prev ?? [])])
              setShowForm(false)
            }}
            onCancel={() => setShowForm(false)}
          />
        )}
        {viewMode === 'calendar' && <CalendarWeekView filters={filters} multiTouch={multiTouch} />}
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
        {viewMode === 'list' && events !== null && events.length > 0 && (
          <IonAccordionGroup
            multiple
            value={expandedSections}
            onIonChange={(e) => setExpandedSections(e.detail.value as string[])}
          >
            <IonAccordion value="starred">
              <IonItem slot="header">
                <IonIcon slot="start" icon={star} color="warning" />
                <IonLabel>Starred ({starredEvents.length})</IonLabel>
              </IonItem>
              <div slot="content">
                {starredEvents.length === 0 && (
                  <div className="coming-soon">
                    <p>No starred events yet</p>
                  </div>
                )}
                {starredEvents.length > 0 && (
                  <IonList>
                    {starredEvents.map((event) => (
                      <EventRow key={event.id} event={event} multiTouch={multiTouch} onSwipe={handleSwipe} />
                    ))}
                  </IonList>
                )}
              </div>
            </IonAccordion>
            <IonAccordion value="new">
              <IonItem slot="header">
                <IonIcon slot="start" icon={sparkles} />
                <IonLabel>New ({newEvents.length})</IonLabel>
              </IonItem>
              <div slot="content">
                {newEvents.length === 0 && (
                  <div className="coming-soon">
                    <p>No new events</p>
                  </div>
                )}
                {newEvents.length > 0 && (
                  <IonList>
                    {newEvents.map((event) => (
                      <EventRow key={event.id} event={event} multiTouch={multiTouch} onSwipe={handleSwipe} />
                    ))}
                  </IonList>
                )}
                {hiddenCount > 0 && (
                  <IonItem button lines="none" detail={false} onClick={revealHidden}>
                    <IonLabel color="medium" className="ion-text-center">
                      Show {hiddenCount} hidden repeating {hiddenCount === 1 ? 'event' : 'events'}
                    </IonLabel>
                  </IonItem>
                )}
              </div>
            </IonAccordion>
            {/* Same square/dropdown shape as Starred/New (feedback,
                2026-08-14: "should look just like the new and star
                sections... same kind of square drop down"), replacing the
                earlier plain centered "Show N dismissed events" link —
                muted icon/label color is the only deemphasis, not a
                different layout. */}
            {dismissedEvents.length > 0 && (
              <IonAccordion value="dismissed">
                <IonItem slot="header">
                  <IonIcon slot="start" icon={eyeOffOutline} color="medium" />
                  <IonLabel color="medium">
                    Dismissed ({dismissedEvents.length})
                  </IonLabel>
                </IonItem>
                <div slot="content">
                  <IonList>
                    {dismissedEvents.map((event) => (
                      <EventRow key={event.id} event={event} multiTouch={multiTouch} onSwipe={handleSwipe} dimmed />
                    ))}
                  </IonList>
                </div>
              </IonAccordion>
            )}
          </IonAccordionGroup>
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
