import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { listOutline, star, starOutline } from 'ionicons/icons'
import { useEffect, useMemo, useState } from 'react'

import { AccountButton } from '../auth/AccountButton'
import { useAuth } from '../auth/AuthContext'
import { fetchEvents, type Event } from './api'
import { formatWhen, teaser } from './format'
import { useStarToggle } from './useStarToggle'

// Filters are declarative so new ones (date range, distance, category, …)
// slot in later without touching the toggle/apply logic below.
interface EventFilter {
  id: string
  label: string
  icon?: string
  requiresAuth?: boolean
  matches: (event: Event) => boolean
}

const FILTERS: EventFilter[] = [
  { id: 'starred', label: 'Starred', icon: starOutline, requiresAuth: true, matches: (e) => e.starred },
]

function StarButton({ event, onToggled }: { event: Event; onToggled: (event: Event) => void }) {
  const { pending, toggleStar } = useStarToggle(onToggled)

  return (
    <IonButton
      fill="clear"
      slot="end"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        toggleStar(event)
      }}
    >
      <IonIcon slot="icon-only" icon={event.starred ? star : starOutline} color={event.starred ? 'warning' : 'medium'} />
    </IonButton>
  )
}

export function EventsPage() {
  const { user } = useAuth()
  const [events, setEvents] = useState<Event[] | null>(null)
  const [error, setError] = useState(false)
  const [activeFilterIds, setActiveFilterIds] = useState<string[]>([])

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch(() => setError(true))
  }, [])

  const visibleFilters = FILTERS.filter((f) => !f.requiresAuth || user)
  const activeFilters = visibleFilters.filter((f) => activeFilterIds.includes(f.id))

  const filteredEvents = useMemo(() => {
    if (!events || activeFilters.length === 0) return events ?? []
    return events.filter((event) => activeFilters.every((f) => f.matches(event)))
  }, [events, activeFilters])

  function toggleFilter(id: string) {
    setActiveFilterIds((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]))
  }

  function updateEvent(updated: Event) {
    setEvents((prev) => prev?.map((e) => (e.id === updated.id ? updated : e)) ?? null)
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
        {visibleFilters.length > 0 && (
          <IonToolbar className="filter-toolbar">
            <div className="filter-row">
              {visibleFilters.map((f) => (
                <IonChip
                  key={f.id}
                  outline={!activeFilterIds.includes(f.id)}
                  color={activeFilterIds.includes(f.id) ? 'primary' : undefined}
                  onClick={() => toggleFilter(f.id)}
                >
                  {f.icon && <IonIcon icon={f.icon} />}
                  <IonLabel>{f.label}</IonLabel>
                </IonChip>
              ))}
            </div>
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
            <p>No events match these filters</p>
          </div>
        )}
        {filteredEvents.length > 0 && (
          <IonList>
            {filteredEvents.map((event) => (
              <IonItem key={event.id} routerLink={`/events/${event.id}`}>
                <IonLabel>
                  <h2>{event.title}</h2>
                  <p>{formatWhen(event)}</p>
                  {event.address && <IonNote>{event.address}</IonNote>}
                  {teaser(event.description) && <p className="teaser">{teaser(event.description)}</p>}
                </IonLabel>
                {user && <StarButton event={event} onToggled={updateEvent} />}
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
