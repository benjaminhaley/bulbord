import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { createOutline, star, starOutline, trashOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { useHistory, useParams } from 'react-router-dom'

import { AddToCalendarButton } from '../calendar/AddToCalendarButton'
import { API_URL } from '../config'
import { mapUrl, shortAddress } from '../format'
import { factLineStyle, leadingButtonGap } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { deleteEvent, fetchEvent, updateEvent, type Event } from './api'
import { CommentsSection } from './CommentsSection'
import { EventForm } from './EventForm'
import { formatWhen } from './format'
import { InterestedBadge } from './InterestedBadge'
import { useEventInterest } from './useEventInterest'

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const history = useHistory()
  const [event, setEvent] = useState<Event | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const { pending: interestPending, setInterest, clearInterest } = useEventInterest(setEvent)

  async function remove() {
    if (!event || !window.confirm('Delete this event?')) return
    await deleteEvent(event.id)
    history.push('/events')
  }

  function toggleInterest() {
    if (!event) return
    if (event.interest_status === 'interested') {
      clearInterest(event)
    } else {
      setInterest(event, 'interested')
    }
  }

  useEffect(() => {
    setEvent(null)
    setError(false)
    fetchEvent(id)
      .then(setEvent)
      .catch(() => setError(true))
  }, [id])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/events" />
          </IonButtons>
          <IonTitle>{event?.title ?? 'Event'}</IonTitle>
          {event && (
            <IonButtons slot="end">
              {event.can_edit && !editing && (
                <>
                  <IonButton onClick={() => setEditing(true)}>
                    <IonIcon slot="icon-only" icon={createOutline} />
                  </IonButton>
                  <IonButton color="danger" onClick={remove}>
                    <IonIcon slot="icon-only" icon={trashOutline} />
                  </IonButton>
                </>
              )}
              <IonButton disabled={interestPending} onClick={toggleInterest}>
                <IonIcon
                  slot="icon-only"
                  icon={event.interest_status === 'interested' ? star : starOutline}
                  color={event.interest_status === 'interested' ? 'warning' : undefined}
                />
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!event && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this event</p>
          </div>
        )}
        {event && editing && (
          <EventForm
            initial={event}
            submitLabel="Save"
            errorMessage="Could not save changes"
            onSubmit={async (input) => {
              setEvent(await updateEvent(event.id, input))
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        )}
        {event && !editing && (
          <>
            {event.image_url ? (
              <img
                src={`${API_URL}${event.image_url}`}
                alt=""
                style={{ width: '100%', borderRadius: 12, marginBottom: 16 }}
              />
            ) : (
              event.submitted_by && (
                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}>
                  <Avatar url={event.submitted_by.avatar_url} name={event.submitted_by.name} size={120} />
                </div>
              )
            )}
            {/* No <h1>{event.title}</h1> here — the toolbar's IonTitle above
                already shows the event's name and stays visible through the
                whole scroll, so a second, large title directly below the
                image was pure duplication (same fix already made on
                CampDetailPage.tsx, 2026-08-05). */}
            <p style={factLineStyle}>
              {/* 'detailed' mode (feedback #78): a detail page is reached via
                  its own URL/back-stack with no surrounding list context, so
                  a relative word alone ("This Saturday") is shown alongside
                  the actual date for clarity, unlike the list row above. */}
              {formatWhen(
                { startDate: event.start_date, startTime: event.start_time, allDay: event.all_day },
                undefined,
                'detailed',
              )}
            </p>
            {event.submitted_by && (
              <p style={{ ...factLineStyle, color: 'var(--ion-color-medium)' }}>Posted by {event.submitted_by.name}</p>
            )}
            {event.interested_count > 0 && (
              <InterestedBadge eventId={event.id} count={event.interested_count} people={event.interested_people} emphasized />
            )}
            {event.location_name && <p style={factLineStyle}>{event.location_name}</p>}
            {event.address && (
              <p style={factLineStyle}>
                <a href={mapUrl(event.address)} target="_blank" rel="noreferrer">
                  {shortAddress(event.address)}
                </a>
              </p>
            )}
            {event.description && <p style={factLineStyle}>{event.description}</p>}
            {/* Feedback #76: lets a member add this event to their own
                calendar (Google/Outlook/.ics — see AddToCalendarButton). */}
            <AddToCalendarButton
              event={{
                title: event.title,
                description: event.description,
                location: event.location_name ?? event.address,
                url: window.location.href,
                startDate: event.start_date,
                startTime: event.start_time,
                allDay: event.all_day,
              }}
              filename={`${event.title}.ics`}
              style={leadingButtonGap}
            />
            {event.source_url && (
              <IonButton expand="block" href={event.source_url} target="_blank" rel="noreferrer" style={leadingButtonGap}>
                View source
              </IonButton>
            )}
            <CommentsSection eventId={event.id} />
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
