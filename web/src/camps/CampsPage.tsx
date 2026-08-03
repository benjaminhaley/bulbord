import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

import { InstitutionBanner } from '../app/InstitutionBanner'

export function CampsPage() {
  return (
    <IonPage>
      <IonHeader>
        <InstitutionBanner />
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
