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
import { addConnection, fetchConnectionsState, type ConnectionsState, type MemberSummary } from './api'

// A section with no members just isn't shown at all (feedback #91) — no
// empty-state placeholder row, unlike most other "nothing here yet" spots
// in this app (e.g. ChooseFriendsScreen's own suggestions list). Three
// section headers plus the "add more friends" prompt already carries the
// nudge; a blank "No mutual friends yet" row under each empty one read as
// clutter, not information.
function Section({
  title,
  members,
  addBackId,
  onAddBack,
}: {
  title: string
  members: MemberSummary[]
  addBackId: string | null
  onAddBack?: (member: MemberSummary) => void
}) {
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
            {onAddBack &&
              (addBackId === member.id ? (
                <IonSpinner slot="end" name="dots" />
              ) : (
                <IonButton slot="end" fill="clear" onClick={() => onAddBack(member)}>
                  Add back
                </IonButton>
              ))}
          </IonItem>
        ))}
      </IonList>
    </>
  )
}

// "Have a page where you can see friends and their state" (feedback #83) —
// three buckets from GET /connections (connections/service.ts's
// deriveConnectionsState): Friends (mutual), Following (you added, they
// haven't reciprocated), Added You (they added you — the "friend back"
// prompt the alert email points here for). "Add more friends" (feedback
// #91) always sits above them, routing to AddFriendsPage's reuse of the
// onboarding ChooseFriendsScreen.
export function FriendsPage() {
  const [state, setState] = useState<ConnectionsState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addingBackId, setAddingBackId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetchConnectionsState()
      .then(setState)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load friends'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function addBack(member: MemberSummary) {
    setAddingBackId(member.id)
    setError(null)
    try {
      await addConnection(member.id)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add friend')
      setAddingBackId(null)
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
            <Section title="Friends" members={state.friends} addBackId={null} />
            <Section title="You Following" members={state.following} addBackId={null} />
            <Section
              title="Following You"
              members={state.followers}
              addBackId={addingBackId}
              onAddBack={addBack}
            />
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
