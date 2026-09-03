import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { personAddOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { Avatar } from '../uploads/Avatar'
import {
  acceptConnection,
  declineConnection,
  fetchConnectionsState,
  type ConnectionsState,
  type MemberSummary,
  type ReceivedRequest,
} from './api'

// A section with no members just isn't shown at all (feedback #91) — no
// empty-state placeholder row, unlike most other "nothing here yet" spots
// in this app (e.g. ChooseFriendsScreen's own suggestions list). Three
// section headers plus the "add more friends" prompt already carries the
// nudge; a blank "No mutual friends yet" row under each empty one read as
// clutter, not information.
function Section({ title, members }: { title: string; members: MemberSummary[] }) {
  if (members.length === 0) return null
  return (
    <>
      <h2 className="ion-padding-start" style={{ marginBottom: 4 }}>
        {title}
      </h2>
      <IonList inset>
        {members.map((member) => (
          <IonItem key={member.id}>
            <Avatar slot="start" url={member.avatarUrl} name={member.name} />
            <IonLabel>{member.name}</IonLabel>
          </IonItem>
        ))}
      </IonList>
    </>
  )
}

// The one section with real actions (feedback #127: a friend request needs
// an Accept and a Decline, not the old single "Add back" button) — busyId
// disables both buttons on a row while its own action is in flight, same
// per-row-busy pattern the old "Add back" spinner used.
function RequestsSection({
  members,
  busyId,
  onAccept,
  onDecline,
}: {
  members: ReceivedRequest[]
  busyId: string | null
  onAccept: (member: ReceivedRequest) => void
  onDecline: (member: ReceivedRequest) => void
}) {
  if (members.length === 0) return null
  return (
    <>
      <h2 className="ion-padding-start" style={{ marginBottom: 4 }}>
        Friend Requests
      </h2>
      <IonList inset>
        {members.map((member) => (
          <IonItem key={member.id}>
            <Avatar slot="start" url={member.avatarUrl} name={member.name} />
            <IonLabel>{member.name}</IonLabel>
            {busyId === member.id ? (
              <IonSpinner slot="end" name="dots" />
            ) : (
              <div slot="end" style={{ display: 'flex', gap: 4 }}>
                <IonButton fill="clear" onClick={() => onDecline(member)}>
                  Decline
                </IonButton>
                <IonButton fill="solid" onClick={() => onAccept(member)}>
                  Accept
                </IonButton>
              </div>
            )}
          </IonItem>
        ))}
      </IonList>
    </>
  )
}

// "Have a page where you can see friends and their state" (feedback #83),
// reworked into a real request/accept model by feedback #127: three
// buckets from GET /connections (connections/service.ts's
// deriveConnectionsState) — Friends (mutual/accepted), Requests Sent
// (pending, I sent), and Friend Requests (pending, they sent me — the ones
// I can accept or decline, which the alert email points here for). "Add
// more friends" (feedback #91) always sits above them, routing to
// AddFriendsPage's reuse of the onboarding ChooseFriendsScreen.
export function FriendsPage() {
  const [state, setState] = useState<ConnectionsState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetchConnectionsState()
      .then(setState)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load friends'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function accept(member: ReceivedRequest) {
    setBusyId(member.id)
    setError(null)
    try {
      await acceptConnection(member.connectionId)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept friend request')
      setBusyId(null)
    }
  }

  async function decline(member: ReceivedRequest) {
    setBusyId(member.id)
    setError(null)
    try {
      await declineConnection(member.connectionId)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline friend request')
      setBusyId(null)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/account" />
          </IonButtons>
          <IonTitle>Friends</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {loading && <IonSpinner name="dots" />}
        {error && (
          <IonText color="danger">
            <p className="ion-padding-start">{error}</p>
          </IonText>
        )}
        {state && (
          <>
            <IonList inset>
              <IonItem button routerLink="/friends/add" lines="none">
                <IonIcon slot="start" icon={personAddOutline} color="primary" />
                <IonLabel color="primary">Add more friends</IonLabel>
              </IonItem>
            </IonList>
            <Section title="Friends" members={state.friends} />
            <RequestsSection members={state.receivedRequests} busyId={busyId} onAccept={accept} onDecline={decline} />
            <Section title="Requests Sent" members={state.sentRequests} />
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
