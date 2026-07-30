import { IonButtons, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

import { AccountButton } from '../auth/AccountButton'

export function CampsPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Camps</IonTitle>
          <IonButtons slot="end">
            <AccountButton />
          </IonButtons>
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
