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
import { Avatar } from '../uploads/Avatar'
import { createCamp, fetchCampsByBreak, type BreakBucket, type Camp, type InterestStatus } from './api'
import { CampForm } from './CampForm'
import { campDetailsLine, formatDateRange, locationLabel, teaser } from './format'
import { applyInterestUpdateAcrossBuckets, flattenAndDedupeCamps } from './grouping'
import { InterestedBadge } from './InterestedBadge'
import { useCampInterest } from './useCampInterest'

// Same single-select rationale as EventsPage's ViewMode — mutually exclusive
// views over interest_status, not AND-composable filters.
type ViewMode = 'new' | 'starred' | 'dismissed'

interface SwipeToast {
  camp: Camp
  previousStatus: InterestStatus | null
  newStatus: InterestStatus
}

const TOAST_MESSAGES: Record<InterestStatus, string> = {
  interested: 'Marked interested',
  dismissed: 'Dismissed',
}

// Shared by the Starred and Dismissed segments below, which only differ in
// which flattened+deduped camps array they pass in.
function FlatCampList({
  camps,
  multiTouch,
  onSwipe,
}: {
  camps: Camp[]
  multiTouch: boolean
  onSwipe: (e: { target: EventTarget | null }, camp: Camp, status: InterestStatus) => void
}) {
  if (camps.length === 0) {
    return (
      <div className="coming-soon">
        <p>No camps match this view</p>
      </div>
    )
  }
  return (
    <IonList>
      {camps.map((camp) => (
        <CampRow key={camp.id} camp={camp} multiTouch={multiTouch} onSwipe={onSwipe} />
      ))}
    </IonList>
  )
}

function closeSliding(target: EventTarget | null) {
  const sliding = (target as HTMLElement | null)?.closest('ion-item-sliding') as HTMLIonItemSlidingElement | null
  sliding?.close()
}

function CampRow({
  camp,
  multiTouch,
  onSwipe,
}: {
  camp: Camp
  multiTouch: boolean
  onSwipe: (e: { target: EventTarget | null }, camp: Camp, status: InterestStatus) => void
}) {
  const location = locationLabel({ locationName: camp.location_name, address: camp.address })
  const description = teaser(camp.description)
  const details = campDetailsLine(camp)

  return (
    <IonItemSliding disabled={multiTouch}>
      <IonItemOptions side="start" onIonSwipe={(e) => onSwipe(e, camp, 'interested')}>
        <IonItemOption expandable color="warning" onClick={(e) => onSwipe(e, camp, 'interested')}>
          <IonIcon slot="icon-only" icon={star} />
        </IonItemOption>
      </IonItemOptions>
      <IonItem routerLink={`/camps/${camp.id}`}>
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
          <h2>{camp.title}</h2>
          <p>{formatDateRange(camp.start_date, camp.end_date)}</p>
          {location && <IonNote>{location}</IonNote>}
          {details && <p className="teaser">{details}</p>}
          {description && <p className="teaser">{description}</p>}
          {camp.interested_count > 0 && (
            <InterestedBadge campId={camp.id} count={camp.interested_count} people={camp.interested_people} />
          )}
        </IonLabel>
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
  const [viewMode, setViewMode] = useState<ViewMode>('new')
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

  // "New" groups by school break/week (only camps with no interest verdict
  // yet, matching EventsPage's per-view filtering); a bucket with nothing new
  // to show is omitted entirely rather than rendered empty. Starred/Dismissed
  // flatten+dedupe across buckets instead — a multi-week camp shouldn't show
  // up 3 times in a flat "starred" list.
  const newBuckets = useMemo(() => {
    if (!buckets) return []
    return buckets
      .map((bucket) => ({ ...bucket, camps: bucket.camps.filter((c) => c.interest_status === null) }))
      .filter((bucket) => bucket.camps.length > 0)
  }, [buckets])

  const flatCamps = useMemo(() => (buckets ? flattenAndDedupeCamps(buckets) : []), [buckets])
  const starredCamps = useMemo(() => flatCamps.filter((c) => c.interest_status === 'interested'), [flatCamps])
  const dismissedCamps = useMemo(() => flatCamps.filter((c) => c.interest_status === 'dismissed'), [flatCamps])

  const hasAnyCamps = flatCamps.length > 0

  function handleSwipe(e: { target: EventTarget | null }, camp: Camp, status: InterestStatus) {
    closeSliding(e.target)
    setSwipeToast({ camp, previousStatus: camp.interest_status, newStatus: status })
    setInterest(camp, status)
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
        {buckets !== null && hasAnyCamps && viewMode === 'new' && newBuckets.length === 0 && (
          <div className="coming-soon">
            <p>No camps match this view</p>
          </div>
        )}
        {viewMode === 'new' && newBuckets.length > 0 && (
          <IonAccordionGroup multiple>
            {newBuckets.map((bucket) => (
              <IonAccordion key={bucket.id} value={bucket.id}>
                <IonItem slot="header">
                  <IonLabel>
                    <h2>{bucket.label}</h2>
                    {bucket.id !== 'other' && (
                      <IonNote>{formatDateRange(bucket.start_date, bucket.end_date)}</IonNote>
                    )}
                  </IonLabel>
                  <IonNote slot="end">{bucket.camps.length}</IonNote>
                </IonItem>
                <div slot="content">
                  <IonList>
                    {bucket.camps.map((camp) => (
                      <CampRow key={camp.id} camp={camp} multiTouch={multiTouch} onSwipe={handleSwipe} />
                    ))}
                  </IonList>
                </div>
              </IonAccordion>
            ))}
          </IonAccordionGroup>
        )}
        {viewMode === 'starred' && <FlatCampList camps={starredCamps} multiTouch={multiTouch} onSwipe={handleSwipe} />}
        {viewMode === 'dismissed' && <FlatCampList camps={dismissedCamps} multiTouch={multiTouch} onSwipe={handleSwipe} />}
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
