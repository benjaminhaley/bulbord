import {
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
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
  useIonViewWillEnter,
} from '@ionic/react'
import { addOutline, closeOutline, eyeOffOutline, listOutline, star } from 'ionicons/icons'
import { useMemo, useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import { InstitutionBanner } from '../app/InstitutionBanner'
import { API_URL } from '../config'
import { createEvent, fetchEvents, type Event, type InterestStatus } from './api'
import { EventForm } from './EventForm'
import { formatWhen, locationLabel, teaser } from './format'
import { InterestedBadge } from './InterestedBadge'
import { useEventInterest } from './useEventInterest'

// 'Starred' and 'Dismissed' are mutually exclusive views over the same
// interest_status field, so this is a single-select mode rather than the
// AND-composable multi-select filters (date range, distance, category, …)
// that may get added here later — keeping the two mechanisms separate avoids
// faking single-select behavior out of a multi-select filter list.
type ViewMode = 'new' | 'starred' | 'dismissed'

// What to show in the undo toast after a swipe, and what to restore if the
// user taps Undo — the status the event had immediately before the swipe.
interface SwipeToast {
  event: Event
  previousStatus: InterestStatus | null
  newStatus: InterestStatus
}

const TOAST_MESSAGES: Record<InterestStatus, string> = {
  interested: 'Marked interested',
  dismissed: 'Dismissed',
}

function closeSliding(target: EventTarget | null) {
  const sliding = (target as HTMLElement | null)?.closest('ion-item-sliding') as HTMLIonItemSlidingElement | null
  sliding?.close()
}

export function EventsPage() {
  const { user } = useAuth()
  const [events, setEvents] = useState<Event[] | null>(null)
  const [error, setError] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('new')
  const [swipeToast, setSwipeToast] = useState<SwipeToast | null>(null)
  const [multiTouch, setMultiTouch] = useState(false)
  const [showForm, setShowForm] = useState(false)
  // Occurrences the next-occurrence collapse is currently suppressing
  // (feedback #48) — 0 once revealHidden() below has fetched everything.
  const [hiddenCount, setHiddenCount] = useState(0)
  const { setInterest, clearInterest } = useEventInterest(updateEvent)

  // Ionic keeps this page's React state alive (hidden, not unmounted) when
  // navigating to an event's detail page and back, for the back-swipe
  // transition — a plain useEffect(fn, []) would only ever run once and
  // never see an edit/delete made on the detail page. useIonViewWillEnter
  // fires on that initial mount too, so it fully replaces useEffect here,
  // not just supplements it.
  useIonViewWillEnter(() => {
    fetchEvents()
      .then(({ events, hiddenCount }) => {
        setEvents(events)
        setHiddenCount(hiddenCount)
      })
      .catch(() => setError(true))
  })

  function revealHidden() {
    fetchEvents({ includeHidden: true })
      .then(({ events, hiddenCount }) => {
        setEvents(events)
        setHiddenCount(hiddenCount)
      })
      .catch(() => setError(true))
  }

  const filteredEvents = useMemo(() => {
    if (!events) return []
    if (viewMode === 'starred') return events.filter((e) => e.interest_status === 'interested')
    if (viewMode === 'dismissed') return events.filter((e) => e.interest_status === 'dismissed')
    return events.filter((e) => e.interest_status === null)
  }, [events, viewMode])

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
        {user && (
          <IonToolbar>
            <IonSegment value={viewMode} onIonChange={(e) => setViewMode(e.detail.value as ViewMode)}>
              <IonSegmentButton value="new">
                <IonLabel>New</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="starred">
                <IonLabel>Starred</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="dismissed">
                <IonLabel>Dismissed</IonLabel>
              </IonSegmentButton>
            </IonSegment>
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
        {events === null && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Coming soon</p>
          </div>
        )}
        {events !== null && events.length === 0 && (
          <div className="coming-soon">
            <p>No upcoming events yet</p>
          </div>
        )}
        {events !== null && events.length > 0 && filteredEvents.length === 0 && (
          <div className="coming-soon">
            <p>No events match this view</p>
          </div>
        )}
        {filteredEvents.length > 0 && (
          <IonList>
            {filteredEvents.map((event) => {
              const location = locationLabel({ locationName: event.location_name, address: event.address })
              const description = teaser(event.description)
              return (
                <IonItemSliding key={event.id} disabled={multiTouch}>
                  <IonItemOptions side="start" onIonSwipe={(e) => handleSwipe(e, event, 'interested')}>
                    <IonItemOption expandable color="warning" onClick={(e) => handleSwipe(e, event, 'interested')}>
                      <IonIcon slot="icon-only" icon={star} />
                    </IonItemOption>
                  </IonItemOptions>
                  <IonItem routerLink={`/events/${event.id}`}>
                    {event.thumbnail_url && (
                      <img
                        src={`${API_URL}${event.thumbnail_url}`}
                        alt=""
                        slot="start"
                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }}
                      />
                    )}
                    <IonLabel>
                      <h2>{event.title}</h2>
                      <p>{formatWhen({ startDate: event.start_date, startTime: event.start_time, allDay: event.all_day })}</p>
                      {location && <IonNote>{location}</IonNote>}
                      {description && <p className="teaser">{description}</p>}
                      {event.interested_count > 0 && (
                        <InterestedBadge eventId={event.id} count={event.interested_count} people={event.interested_people} />
                      )}
                    </IonLabel>
                  </IonItem>
                  <IonItemOptions side="end" onIonSwipe={(e) => handleSwipe(e, event, 'dismissed')}>
                    <IonItemOption expandable color="medium" onClick={(e) => handleSwipe(e, event, 'dismissed')}>
                      <IonIcon slot="icon-only" icon={eyeOffOutline} />
                    </IonItemOption>
                  </IonItemOptions>
                </IonItemSliding>
              )
            })}
          </IonList>
        )}
        {hiddenCount > 0 && viewMode === 'new' && (
          <IonItem button lines="none" detail={false} onClick={revealHidden}>
            <IonLabel color="medium" className="ion-text-center">
              Show {hiddenCount} hidden repeating {hiddenCount === 1 ? 'event' : 'events'}
            </IonLabel>
          </IonItem>
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
