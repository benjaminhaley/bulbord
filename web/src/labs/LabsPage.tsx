import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonPage, IonTitle, IonToolbar } from '@ionic/react'
import { calendarNumberOutline, footballOutline } from 'ionicons/icons'

// A deliberately buried catch-all for small, non-serious side projects that
// don't belong as a real tab/feature — reached only via Account's own
// low-visibility "Labs" row (see AccountPage.tsx). Each lab below is a real
// `<IonItem href>` (a genuine full-page navigation, not a React Router
// routerLink) rather than a client route, since every lab so far lives
// entirely outside the SPA (a static file under web/public/): Soccer Math
// needs to be usable with zero login/passkey friction, and every lab is
// sandboxed from the app on purpose (CLAUDE.md's Labs section) — a lab
// talks to Bulbord only through the API's /labs/<name> routes.
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
        <IonNote color="medium">Hello, world! Small, just-for-fun side projects — nothing here is a real Bulbord feature.</IonNote>
        <IonList inset style={{ marginTop: 12 }}>
          <IonItem button href="/soccer-math/" lines="none">
            <IonIcon slot="start" icon={footballOutline} />
            <IonLabel>
              <h2>Soccer Math</h2>
              <p>A soccer-themed times-tables shootout, with a leaderboard.</p>
            </IonLabel>
          </IonItem>
          <IonItem button href="/labs/tracker/" lines="none">
            <IonIcon slot="start" icon={calendarNumberOutline} />
            <IonLabel>
              <h2>Tracker</h2>
              <p>When's the next date, playdate, trip, or hangout? Red means nothing's planned.</p>
            </IonLabel>
          </IonItem>
        </IonList>
      </IonContent>
    </IonPage>
  )
}
