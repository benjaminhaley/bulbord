import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

export function EventsPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Events</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        <div className="coming-soon">
          <p>Coming soon</p>
        </div>
      </IonContent>
    </IonPage>
  )
}
