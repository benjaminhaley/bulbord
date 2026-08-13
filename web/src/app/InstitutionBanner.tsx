import { IonToolbar } from '@ionic/react'
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
    <IonToolbar style={{ '--background': 'var(--banner-bg)', '--color': 'var(--banner-ink)' } as React.CSSProperties}>
      <div
        slot="start"
        role="button"
        onClick={() => history.push('/about')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, paddingInlineStart: 16, cursor: 'pointer' }}
      >
        <img src="/nettelhorst-logo.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
        <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Nettelhorst Bulbord</span>
      </div>
      <div
        slot="end"
        role="button"
        onClick={() => history.push('/account')}
        style={{ display: 'flex', alignItems: 'center', paddingInlineEnd: 16, cursor: 'pointer' }}
      >
        {user && <Avatar url={user.avatarUrl} name={user.name} size={32} />}
      </div>
    </IonToolbar>
  )
}
