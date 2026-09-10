import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonPage, IonTitle, IonToolbar } from '@ionic/react'
import { footballOutline } from 'ionicons/icons'

// A deliberately buried catch-all for small, non-serious side projects that
// don't belong as a real tab/feature — reached only via Account's own
// low-visibility "Labs" row (see AccountPage.tsx). Each lab below is a real
// `<IonItem href>` (a genuine full-page navigation, not a React Router
// routerLink) rather than a client route, since every lab so far lives
// entirely outside the SPA (a static file under web/public/) and has its
// own reason to: Soccer Math needs to be usable with zero login/passkey
// friction, which nothing behind JoinGate can offer.
export function LabsPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/account" />
          </IonButtons>
          <IonTitle>Labs</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        <IonNote color="medium">Small, just-for-fun side projects — nothing here is a real Bulbord feature.</IonNote>
        <IonList inset style={{ marginTop: 12 }}>
          <IonItem button href="/soccer-math/" lines="none">
            <IonIcon slot="start" icon={footballOutline} />
            <IonLabel>
              <h2>Soccer Math</h2>
              <p>A soccer-themed times-tables shootout, with a leaderboard.</p>
            </IonLabel>
          </IonItem>
        </IonList>
      </IonContent>
    </IonPage>
  )
}
