import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

export function CampsPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Camps</IonTitle>
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
