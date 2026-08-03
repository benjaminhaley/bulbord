import { IonButton, IonIcon } from '@ionic/react'
import { personCircleOutline } from 'ionicons/icons'

// The small logo badge represents which institution's community this is
// (Nettelhorst today, see CLAUDE.md Product shape) — distinct from
// AccountButton's own icon, which is the signed-in member's own profile.
// Sourced from the school's own site (nettelhorst.org/pics/nettlehorst-n.png).
function InstitutionBadge() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        backgroundColor: '#3d3d3d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 4,
      }}
    >
      <img src="/nettelhorst-logo.png" alt="Nettelhorst" style={{ width: 18, height: 18, objectFit: 'contain' }} />
    </div>
  )
}

export function AccountButton() {
  return (
    <>
      <InstitutionBadge />
      <IonButton routerLink="/account">
        <IonIcon slot="icon-only" icon={personCircleOutline} />
      </IonButton>
    </>
  )
}
