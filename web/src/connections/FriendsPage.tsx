import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { useEffect, useState } from 'react'

import { Avatar } from '../uploads/Avatar'
import { addConnection, fetchConnectionsState, type ConnectionsState, type MemberSummary } from './api'

function Section({
  title,
  members,
  emptyText,
  addBackId,
  onAddBack,
}: {
  title: string
  members: MemberSummary[]
  emptyText: string
  addBackId: string | null
  onAddBack?: (member: MemberSummary) => void
}) {
  return (
    <>
      <h2 className="ion-padding-start" style={{ marginBottom: 4 }}>
        {title}
      </h2>
      <IonList inset>
        {members.length === 0 && (
          <IonItem lines="none">
            <IonLabel color="medium">{emptyText}</IonLabel>
          </IonItem>
        )}
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
// prompt the alert email points here for).
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
            <Section title="Friends" members={state.friends} emptyText="No mutual friends yet" addBackId={null} />
            <Section title="You Following" members={state.following} emptyText="Not following anyone yet" addBackId={null} />
            <Section
              title="Following You"
              members={state.followers}
              emptyText="No one has added you yet"
              addBackId={addingBackId}
              onAddBack={addBack}
            />
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
