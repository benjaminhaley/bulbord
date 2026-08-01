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
} from '@ionic/react'
import { eyeOffOutline, listOutline, star } from 'ionicons/icons'
import { useEffect, useMemo, useState } from 'react'

import { AccountButton } from '../auth/AccountButton'
import { useAuth } from '../auth/AuthContext'
import { API_URL } from '../config'
import { fetchEvents, type Event, type InterestStatus } from './api'
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
  const { setInterest, clearInterest } = useEventInterest(updateEvent)

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch(() => setError(true))
  }, [])

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

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Events</IonTitle>
          <IonButtons slot="end">
            <IonButton routerLink="/event-sources">
              <IonIcon slot="icon-only" icon={listOutline} />
            </IonButton>
            <AccountButton />
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
      <IonContent fullscreen>
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
              const location = locationLabel(event)
              const description = teaser(event.description)
              return (
                <IonItemSliding key={event.id}>
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
                      <p>{formatWhen(event)}</p>
                      {location && <IonNote>{location}</IonNote>}
                      {description && <p className="teaser">{description}</p>}
                      {event.interested_count > 0 && (
                        <InterestedBadge eventId={event.id} count={event.interested_count} names={event.interested_names} />
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
