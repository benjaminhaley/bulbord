import {
  IonAccordion,
  IonAccordionGroup,
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
import { addOutline, closeOutline, eyeOffOutline, listOutline, star, starOutline } from 'ionicons/icons'
import { useMemo, useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import { InstitutionBanner } from '../app/InstitutionBanner'
import { API_URL } from '../config'
import { Avatar } from '../uploads/Avatar'
import { createCamp, fetchCampsByBreak, type BreakBucket, type Camp, type InterestStatus } from './api'
import { CampForm } from './CampForm'
import { campDetailsLine, distanceLabel, formatDateRange, locationLabel, timeLabel } from './format'
import { applyInterestUpdateAcrossBuckets } from './grouping'
import { InterestedBadge } from './InterestedBadge'
import { useCampInterest } from './useCampInterest'

interface SwipeToast {
  camp: Camp
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

function CampRow({
  camp,
  multiTouch,
  onSwipe,
  onToggleStar,
  hideDateIfMatches,
}: {
  camp: Camp
  multiTouch: boolean
  onSwipe: (e: { target: EventTarget | null }, camp: Camp, status: InterestStatus) => void
  // Tapping the star icon is a second, direct way to star/unstar a camp,
  // alongside the existing swipe gesture (feedback #59 asked for the icon
  // without removing swipe, since some people already rely on it).
  onToggleStar: (e: React.MouseEvent, camp: Camp) => void
  // The enclosing accordion section's own date range, when one is shown in
  // its header (feedback, 2026-08-05: "don't bother showing the date on
  // each event in this preview view since that's already obvious from the
  // context of which day you are looking at") — the per-row date line is
  // only redundant, and so only hidden, when this camp's own range exactly
  // matches the header's; a multi-day bucket (e.g. Winter Break) can still
  // contain a camp with a narrower real range (e.g. Dec 21-23 within
  // Dec 21-Jan 1), which is real information the header alone doesn't
  // convey, so that case keeps showing its own date.
  hideDateIfMatches?: { start_date: string; end_date: string }
}) {
  const location = locationLabel({ locationName: camp.location_name, address: camp.address })
  const details = campDetailsLine(camp)
  const showDate =
    !hideDateIfMatches || camp.start_date !== hideDateIfMatches.start_date || camp.end_date !== hideDateIfMatches.end_date
  const isStarred = camp.interest_status === 'interested'
  const isDismissed = camp.interest_status === 'dismissed'

  return (
    <IonItemSliding disabled={multiTouch}>
      <IonItemOptions side="start" onIonSwipe={(e) => onSwipe(e, camp, 'interested')}>
        <IonItemOption expandable color="warning" onClick={(e) => onSwipe(e, camp, 'interested')}>
          <IonIcon slot="icon-only" icon={star} />
        </IonItemOption>
      </IonItemOptions>
      {/* Dismissed camps stay in their normal alphabetical section (sunk to
          the bottom by the caller, not filtered out) but read as
          de-emphasized rather than an ordinary upcoming option (feedback
          #59: "hide them at the bottom... in gray"). */}
      <IonItem routerLink={`/camps/${camp.id}`} style={isDismissed ? { opacity: 0.55 } : undefined}>
        {camp.thumbnail_url ? (
          <img
            src={`${API_URL}${camp.thumbnail_url}`}
            alt=""
            slot="start"
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }}
          />
        ) : (
          camp.submitted_by && <Avatar url={camp.submitted_by.avatar_url} name={camp.submitted_by.name} size={56} slot="start" />
        )}
        <IonLabel>
          <h2>
            {camp.title}
            {isDismissed && (
              <IonNote style={{ marginLeft: 6, fontSize: '0.75em', textTransform: 'uppercase' }}>Dismissed</IonNote>
            )}
          </h2>
          {showDate && <p>{formatDateRange(camp.start_date, camp.end_date)}</p>}
          <p>{timeLabel(camp.start_time, camp.end_time)}</p>
          {/* Distance sits next to location, not in the price/age line below
              (feedback, 2026-08-05: "it's just more relevant for address
              information") — same " · " convention as everywhere else. */}
          {location && (
            <IonNote>
              {location} · {distanceLabel(camp.distance_miles)}
            </IonNote>
          )}
          <p className="teaser">{details}</p>
          {camp.interested_count > 0 && (
            <InterestedBadge campId={camp.id} count={camp.interested_count} people={camp.interested_people} />
          )}
        </IonLabel>
        <IonButton
          slot="end"
          fill="clear"
          onClick={(e) => onToggleStar(e, camp)}
          aria-label={isStarred ? 'Unstar this camp' : 'Star this camp'}
        >
          <IonIcon slot="icon-only" icon={isStarred ? star : starOutline} color={isStarred ? 'warning' : 'medium'} />
        </IonButton>
      </IonItem>
      <IonItemOptions side="end" onIonSwipe={(e) => onSwipe(e, camp, 'dismissed')}>
        <IonItemOption expandable color="medium" onClick={(e) => onSwipe(e, camp, 'dismissed')}>
          <IonIcon slot="icon-only" icon={eyeOffOutline} />
        </IonItemOption>
      </IonItemOptions>
    </IonItemSliding>
  )
}

export function CampsPage() {
  const { user } = useAuth()
  const [buckets, setBuckets] = useState<BreakBucket[] | null>(null)
  const [error, setError] = useState(false)
  const [swipeToast, setSwipeToast] = useState<SwipeToast | null>(null)
  const [multiTouch, setMultiTouch] = useState(false)
  const [showForm, setShowForm] = useState(false)

  function updateCampInBuckets(updated: Camp) {
    setBuckets((prev) => (prev ? applyInterestUpdateAcrossBuckets(prev, updated.id, updated) : null))
  }
  const { setInterest, clearInterest } = useCampInterest(updateCampInBuckets)

  function reload() {
    fetchCampsByBreak()
      .then(setBuckets)
      .catch(() => setError(true))
  }

  // Same Ionic-page-state-alive gotcha events/EventsPage.tsx documents —
  // useIonViewWillEnter (not useEffect) so a camp posted/edited/deleted on
  // the detail page is reflected when navigating back here.
  useIonViewWillEnter(reload)

  // One list, grouped by school break/week, showing every camp regardless of
  // interest state (feedback #59: dropped the separate New/Starred/Dismissed
  // tabs) — dismissed camps sink to the bottom of their own bucket rather
  // than being filtered out, with everything else keeping its existing
  // (alphabetical) relative order. Array#filter preserves relative order, so
  // concatenating the two partitions is a stable sort.
  const displayBuckets = useMemo(() => {
    if (!buckets) return []
    return buckets
      .map((bucket) => ({
        ...bucket,
        camps: [
          ...bucket.camps.filter((c) => c.interest_status !== 'dismissed'),
          ...bucket.camps.filter((c) => c.interest_status === 'dismissed'),
        ],
      }))
      .filter((bucket) => bucket.camps.length > 0)
  }, [buckets])

  const hasAnyCamps = (buckets ?? []).some((bucket) => bucket.camps.length > 0)

  function handleSwipe(e: { target: EventTarget | null }, camp: Camp, status: InterestStatus) {
    closeSliding(e.target)
    setSwipeToast({ camp, previousStatus: camp.interest_status, newStatus: status })
    setInterest(camp, status)
  }

  // The star icon toggles: tapping it on an unstarred (or dismissed) camp
  // stars it, same as swiping right, with the same undo toast; tapping it on
  // an already-starred camp just clears it, no toast — the action is its own
  // undo (tap again to re-star).
  function handleStarTap(e: React.MouseEvent, camp: Camp) {
    e.preventDefault()
    e.stopPropagation()
    if (camp.interest_status === 'interested') {
      clearInterest(camp)
    } else {
      setSwipeToast({ camp, previousStatus: camp.interest_status, newStatus: 'interested' })
      setInterest(camp, 'interested')
    }
  }

  function undoSwipe() {
    if (!swipeToast) return
    const { camp, previousStatus } = swipeToast
    if (previousStatus === null) {
      clearInterest(camp)
    } else {
      setInterest(camp, previousStatus)
    }
  }

  // Same pinch-to-zoom guard as EventsPage.tsx — the only other screen with
  // swipeable list items.
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
          <IonTitle>Camps</IonTitle>
          <IonButtons slot="end">
            {user && (
              <IonButton onClick={() => setShowForm((v) => !v)}>
                <IonIcon slot="icon-only" icon={showForm ? closeOutline : addOutline} />
              </IonButton>
            )}
            <IonButton routerLink="/camp-sources">
              <IonIcon slot="icon-only" icon={listOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
        {showForm && (
          <CampForm
            submitLabel="Post"
            errorMessage="Could not post this camp"
            onSubmit={async (input) => {
              await createCamp(input)
              setShowForm(false)
              reload()
            }}
            onCancel={() => setShowForm(false)}
          />
        )}
        {buckets === null && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Coming soon</p>
          </div>
        )}
        {buckets !== null && !hasAnyCamps && (
          <div className="coming-soon">
            <p>No upcoming camps yet</p>
          </div>
        )}
        {displayBuckets.length > 0 && (
          <IonAccordionGroup multiple>
            {displayBuckets.map((bucket) => (
              <IonAccordion key={bucket.id} value={bucket.id}>
                <IonItem slot="header">
                  <IonLabel>
                    <h2>{bucket.label}</h2>
                    {bucket.id !== 'other' && (
                      <IonNote>{formatDateRange(bucket.start_date, bucket.end_date)}</IonNote>
                    )}
                  </IonLabel>
                </IonItem>
                <div slot="content">
                  <IonList>
                    {bucket.camps.map((camp) => (
                      <CampRow
                        key={camp.id}
                        camp={camp}
                        multiTouch={multiTouch}
                        onSwipe={handleSwipe}
                        onToggleStar={handleStarTap}
                        hideDateIfMatches={
                          bucket.id !== 'other' ? { start_date: bucket.start_date, end_date: bucket.end_date } : undefined
                        }
                      />
                    ))}
                  </IonList>
                </div>
              </IonAccordion>
            ))}
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
