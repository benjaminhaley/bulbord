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
import { addOutline, closeOutline, eyeOffOutline, filterOutline, star, starOutline } from 'ionicons/icons'
import { useMemo, useState } from 'react'

import { InstitutionBanner } from '../app/InstitutionBanner'
import { useAuth } from '../auth/AuthContext'
import { API_URL } from '../config'
import { defaultAgesForKids } from '../gradeAges'
import { useDefaultAgesSync } from '../useDefaultAgesSync'
import { Avatar } from '../uploads/Avatar'
import { createSportsClub, fetchSportsClubs, type InterestStatus, type SportsClubListItem } from './api'
import { matchesCategoryFilter, matchesScheduleFilter, matchesSportsClubAgeFilter } from './filters'
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  distanceLabel,
  isLocationRedundantWithTitle,
  locationLabel,
  nextOccurrenceDayTimeLabel,
  scheduleSummary,
  signupStatusChipStyle,
  signupStatusLabel,
  sportsClubDetailsLine,
} from './format'
import { InterestedBadge } from './InterestedBadge'
import { DEFAULT_SPORTS_CLUB_FILTERS, SportsClubFilterChips } from './SportsClubFilterChips'
import { SportsClubForm } from './SportsClubForm'
import { useSportsClubInterest } from './useSportsClubInterest'

interface SwipeToast {
  club: SportsClubListItem
  previousStatus: InterestStatus | null
  newStatus: InterestStatus
}

const TOAST_MESSAGES: Record<InterestStatus, string> = {
  interested: 'Marked interested',
  dismissed: 'Dismissed',
}

// A club with no category (shouldn't happen for a real listing — category
// is required on the member self-service form — but grouping still needs
// somewhere to put one rather than silently dropping it) falls into the
// same "Other" bucket CATEGORY_OPTIONS already has.
const FALLBACK_CATEGORY = 'Other'

function closeSliding(target: EventTarget | null) {
  const sliding = (target as HTMLElement | null)?.closest('ion-item-sliding') as HTMLIonItemSlidingElement | null
  sliding?.close()
}

function SportsClubRow({
  club,
  multiTouch,
  onSwipe,
  onToggleStar,
}: {
  club: SportsClubListItem
  multiTouch: boolean
  onSwipe: (e: { target: EventTarget | null }, club: SportsClubListItem, status: InterestStatus) => void
  onToggleStar: (e: React.MouseEvent, club: SportsClubListItem) => void
}) {
  const location = locationLabel({ locationName: club.location_name, address: club.address })
  const locationRedundant = isLocationRedundantWithTitle(club.title, club.location_name)
  const details = sportsClubDetailsLine(club)
  const dayTime = nextOccurrenceDayTimeLabel(club.occurrences) ?? club.cadence_note
  const isStarred = club.interest_status === 'interested'
  const isDismissed = club.interest_status === 'dismissed'

  return (
    <IonItemSliding disabled={multiTouch}>
      <IonItemOptions side="start" onIonSwipe={(e) => onSwipe(e, club, 'interested')}>
        <IonItemOption expandable color="warning" onClick={(e) => onSwipe(e, club, 'interested')}>
          <IonIcon slot="icon-only" icon={star} />
        </IonItemOption>
      </IonItemOptions>
      <IonItem routerLink={`/sports-clubs/${club.id}`} style={isDismissed ? { opacity: 0.55 } : undefined}>
        {club.thumbnail_url ? (
          <img
            src={`${API_URL}${club.thumbnail_url}`}
            alt=""
            slot="start"
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }}
          />
        ) : (
          club.submitted_by && <Avatar url={club.submitted_by.avatar_url} name={club.submitted_by.name} size={56} slot="start" />
        )}
        <IonLabel>
          <h2>
            {club.title}
            {isDismissed && (
              <IonNote style={{ marginLeft: 6, fontSize: '0.75em', textTransform: 'uppercase' }}>Dismissed</IonNote>
            )}
          </h2>
          {/* Feedback (2026-08-18): the schedule-type badge chip is gone —
              scheduleSummary's own words ("Ongoing — join anytime" or the
              real date range) already say this, so the colored pill was
              purely decorative. */}
          <p>{scheduleSummary(club)}</p>
          {dayTime && <p>{dayTime}</p>}
          <p>
            <IonBadge style={{ ...signupStatusChipStyle(club.signup_status), fontWeight: 500 }}>
              {signupStatusLabel(club.signup_status)}
            </IonBadge>
          </p>
          {location && (
            <IonNote>
              {!locationRedundant && `${location} · `}
              {distanceLabel(club.distance_miles)}
            </IonNote>
          )}
          <p className="teaser">{details}</p>
          {club.interested_count > 0 && (
            <InterestedBadge sportsClubId={club.id} count={club.interested_count} people={club.interested_people} />
          )}
        </IonLabel>
        <IonButton
          slot="end"
          fill="clear"
          onClick={(e) => onToggleStar(e, club)}
          aria-label={isStarred ? 'Unstar this listing' : 'Star this listing'}
        >
          <IonIcon slot="icon-only" icon={isStarred ? star : starOutline} color={isStarred ? 'warning' : 'medium'} />
        </IonButton>
      </IonItem>
      <IonItemOptions side="end" onIonSwipe={(e) => onSwipe(e, club, 'dismissed')}>
        <IonItemOption expandable color="medium" onClick={(e) => onSwipe(e, club, 'dismissed')}>
          <IonIcon slot="icon-only" icon={eyeOffOutline} />
        </IonItemOption>
      </IonItemOptions>
    </IonItemSliding>
  )
}

export function SportsClubsPage() {
  const { user } = useAuth()
  const [clubs, setClubs] = useState<SportsClubListItem[] | null>(null)
  const [hiddenStartedCount, setHiddenStartedCount] = useState(0)
  const [error, setError] = useState(false)
  const [swipeToast, setSwipeToast] = useState<SwipeToast | null>(null)
  const [multiTouch, setMultiTouch] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showStarted, setShowStarted] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Age defaults on to the viewer's own kids' permissive ages (feedback
  // #103, 2026-08-19) — every other filter here still defaults empty/off.
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_SPORTS_CLUB_FILTERS, ages: defaultAgesForKids(user?.kids ?? []) }))
  // Re-syncs filters.ages if the viewer's kids change later in the same
  // session (feedback #122 — see useDefaultAgesSync.ts for why the
  // useState initializer above isn't enough on its own).
  useDefaultAgesSync(user?.kids, (updater) => setFilters((prev) => ({ ...prev, ages: updater(prev.ages) })))
  const activeFilterCount = filters.categories.length + filters.days.length + filters.times.length + filters.ages.length
  const hasActiveFilters = activeFilterCount > 0

  function updateClubInList(updated: { id: string }) {
    setClubs((prev) => (prev ? prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)) : null))
  }
  const { setInterest, clearInterest } = useSportsClubInterest(updateClubInList)

  function reload(includeStarted = showStarted) {
    fetchSportsClubs(includeStarted)
      .then(({ data, hiddenStartedCount: hidden }) => {
        setClubs(data)
        setHiddenStartedCount(hidden)
      })
      .catch(() => setError(true))
  }

  // Same Ionic-page-state-alive gotcha Events'/Camps' own pages document —
  // useIonViewWillEnter (not useEffect) so a listing posted/edited/deleted
  // on the detail page is reflected when navigating back here.
  useIonViewWillEnter(() => reload())

  function revealStarted() {
    setShowStarted(true)
    reload(true)
  }

  // Feedback (2026-08-19): "filter here, which allows you to filter by
  // topic. And schedule..." — applied before grouping, so a narrowed Topic
  // selection simply removes non-matching accordion sections entirely
  // (each accordion already IS a category) rather than needing a separate
  // suppression mechanism.
  const filteredClubs = useMemo(() => {
    if (!clubs) return null
    return clubs.filter(
      (c) =>
        matchesCategoryFilter(c, filters.categories) &&
        matchesScheduleFilter(c, filters.days, filters.times) &&
        matchesSportsClubAgeFilter(c, filters.ages),
    )
  }, [clubs, filters])

  // Feedback (2026-08-18): "let's go ahead and have things organized by
  // category to start, so one accordion fold per category" — replaces the
  // earlier flat-sorted-list design. Clubs arrive already sorted by
  // effective start date (see api/src/sports-clubs/sorting.ts); grouping by
  // category here preserves that relative order within each bucket
  // (Array#filter preserves order), same "sort once, partition many times"
  // approach Camps' own break-bucket grouping uses. Only categories that
  // actually have a club are rendered — unlike Camps' school-break buckets,
  // there's no fixed calendar structure here that needs an empty section
  // shown as "nothing yet."
  const categoryGroups = useMemo(() => {
    if (!filteredClubs) return []
    return CATEGORY_OPTIONS.map((category) => ({
      category,
      clubs: filteredClubs.filter((c) => (c.category ?? FALLBACK_CATEGORY) === category),
    })).filter((group) => group.clubs.length > 0)
  }, [filteredClubs])

  function handleSwipe(e: { target: EventTarget | null }, club: SportsClubListItem, status: InterestStatus) {
    closeSliding(e.target)
    setSwipeToast({ club, previousStatus: club.interest_status, newStatus: status })
    setInterest(club, status)
  }

  function handleStarTap(e: React.MouseEvent, club: SportsClubListItem) {
    e.preventDefault()
    e.stopPropagation()
    if (club.interest_status === 'interested') {
      clearInterest(club)
    } else {
      setSwipeToast({ club, previousStatus: club.interest_status, newStatus: 'interested' })
      setInterest(club, 'interested')
    }
  }

  function undoSwipe() {
    if (!swipeToast) return
    const { club, previousStatus } = swipeToast
    if (previousStatus === null) {
      clearInterest(club)
    } else {
      setInterest(club, previousStatus)
    }
  }

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
          <IonTitle>Sports & Clubs</IonTitle>
          <IonButtons slot="end">
            {/* Same filterOutline pressed-state toggle Events settled on
                (feedback #97/#102) — color primary only while a filter is
                active or the chip row is open. No count badge (feedback,
                2026-08-19: "remove that 4 from the filter icon") — the open
                chip row's own labels (e.g. "4 ages") already say what's
                selected, so the number on the icon was redundant. */}
            <IonButton onClick={() => setFiltersOpen((v) => !v)} aria-label="Toggle filters">
              <IonIcon slot="icon-only" icon={filterOutline} color={hasActiveFilters || filtersOpen ? 'primary' : undefined} />
            </IonButton>
            {user && (
              <IonButton onClick={() => setShowForm((v) => !v)}>
                <IonIcon slot="icon-only" icon={showForm ? closeOutline : addOutline} />
              </IonButton>
            )}
          </IonButtons>
        </IonToolbar>
        {filtersOpen && (
          <IonToolbar style={{ '--min-height': '40px', '--padding-start': '0', '--padding-end': '0' } as React.CSSProperties}>
            <SportsClubFilterChips filters={filters} onChange={setFilters} />
          </IonToolbar>
        )}
      </IonHeader>
      <IonContent fullscreen onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
        {showForm && (
          <SportsClubForm
            submitLabel="Post"
            errorMessage="Could not post this listing"
            onSubmit={async (input) => {
              await createSportsClub(input)
              setShowForm(false)
              reload()
            }}
            onCancel={() => setShowForm(false)}
          />
        )}
        {clubs === null && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Coming soon</p>
          </div>
        )}
        {clubs !== null && clubs.length === 0 && (
          <div className="coming-soon">
            <p>Coming soon</p>
          </div>
        )}
        {clubs !== null && clubs.length > 0 && filteredClubs !== null && filteredClubs.length === 0 && (
          <div className="coming-soon">
            <p>No listings match these filters</p>
          </div>
        )}
        {categoryGroups.length > 0 && (
          <>
            <IonAccordionGroup multiple>
              {categoryGroups.map((group) => (
                <IonAccordion key={group.category} value={group.category}>
                  <IonItem slot="header">
                    <IonLabel>
                      {categoryLabel(group.category)} <IonNote>({group.clubs.length})</IonNote>
                    </IonLabel>
                  </IonItem>
                  <div slot="content">
                    <IonList>
                      {group.clubs.map((club) => (
                        <SportsClubRow
                          key={club.id}
                          club={club}
                          multiTouch={multiTouch}
                          onSwipe={handleSwipe}
                          onToggleStar={handleStarTap}
                        />
                      ))}
                    </IonList>
                  </div>
                </IonAccordion>
              ))}
            </IonAccordionGroup>
            {!showStarted && hiddenStartedCount > 0 && (
              <IonItem button lines="none" detail={false} onClick={revealStarted}>
                <IonLabel color="medium" className="ion-text-center">
                  Show {hiddenStartedCount} already-started {hiddenStartedCount === 1 ? 'listing' : 'listings'}
                </IonLabel>
              </IonItem>
            )}
          </>
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
