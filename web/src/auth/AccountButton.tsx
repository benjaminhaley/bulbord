import { IonButton, IonIcon } from '@ionic/react'
import { personCircleOutline } from 'ionicons/icons'

export function AccountButton() {
  return (
    <IonButton routerLink="/account">
      <IonIcon slot="icon-only" icon={personCircleOutline} />
    </IonButton>
  )
}
