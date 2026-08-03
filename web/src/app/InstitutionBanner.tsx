import { IonIcon, IonToolbar } from '@ionic/react'
import { personCircleOutline } from 'ionicons/icons'
import { useHistory } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { Avatar } from '../uploads/Avatar'

// Persistent workspace-style banner (Slack/ClassDojo pattern, feedback):
// institution identity (logo + name) on the left, the signed-in member's
// own picture on the right as the entry point to their account. Rendered
// once per page's IonHeader (Ionic supports stacking multiple IonToolbars
// in one header — the same mechanism EventsPage's segment row already
// uses), rather than hoisted above IonTabs globally, since ion-tabs'
// position: absolute/inset: 0 layout (see index.css's tab-bar-disappearing
// history) makes a truly global fixed banner risky to introduce.
export function InstitutionBanner() {
  const { user } = useAuth()
  const history = useHistory()

  return (
    <IonToolbar style={{ '--background': '#2c2c2c', '--color': 'white' } as React.CSSProperties}>
      <div
        slot="start"
        style={{ display: 'flex', alignItems: 'center', gap: 10, paddingInlineStart: 16 }}
      >
        <img src="/nettelhorst-logo.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
        <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Nettelhorst</span>
      </div>
      <div
        slot="end"
        role="button"
        onClick={() => history.push('/account')}
        style={{ display: 'flex', alignItems: 'center', paddingInlineEnd: 16, cursor: 'pointer' }}
      >
        {user?.avatarUrl ? (
          <Avatar url={user.avatarUrl} size={32} />
        ) : (
          <IonIcon icon={personCircleOutline} style={{ fontSize: 32, color: 'white' }} />
        )}
      </div>
    </IonToolbar>
  )
}
