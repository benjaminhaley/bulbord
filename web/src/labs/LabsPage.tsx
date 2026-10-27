import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonPage, IonTitle, IonToolbar } from '@ionic/react'
import { calendarNumberOutline, footballOutline } from 'ionicons/icons'

// The list of labs: independent experiments walled off from Bulbord (see
// labs/README.md). Each row is a plain full-page `href` to the lab's own
// static page under web/public/labs/<name>/ — never a client route, and
// nothing here imports from a lab.
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
          <IonItem button href="/labs/soccer-math/" lines="none">
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
