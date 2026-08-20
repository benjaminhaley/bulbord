import { IonIcon, IonToolbar } from '@ionic/react'
import { notificationsOutline } from 'ionicons/icons'
import { useHistory } from 'react-router-dom'

import { useDataFreshness } from '../admin/DataFreshnessContext'
import { useAuth } from '../auth/AuthContext'
import { Avatar } from '../uploads/Avatar'
import { BadgeDot } from './BadgeDot'

// Persistent workspace-style banner (Slack/ClassDojo pattern, feedback):
// institution identity (logo + name) on the left, a bell icon + the signed-in
// member's own picture on the right — two separate entry points (Facebook's
// own top bar convention: a bell for notifications, your photo for your own
// profile), not one avatar overloaded to mean both (feedback, 2026-08-17,
// after the overloaded version shipped and read as "confusing and buried" —
// getting to your own profile shouldn't require going through Notifications
// first). Once per page's IonHeader (Ionic supports stacking multiple
// IonToolbars in one header — the same mechanism EventsPage's segment row
// already uses), rather than hoisted above IonTabs globally, since ion-tabs'
// position: absolute/inset: 0 layout (see index.css's tab-bar-disappearing
// history) makes a truly global fixed banner risky to introduce.
export function InstitutionBanner() {
  const { user, isAdmin } = useAuth()
  const { freshness } = useDataFreshness()
  const history = useHistory()
  // Feedback #69: a quiet nudge that events/camps data has gone stale,
  // visible from anywhere without opening Dev Tools first — admin-only,
  // since only Ben acts on it. Independent of the unified notification
  // badge below (it's an operational nudge, not a member notification) —
  // color="warning" (feedback #114) is what actually marks that
  // independence visually, since both badges otherwise share the same
  // corner/size/position on the avatar.
  const showStaleBadge = isAdmin && (freshness?.is_stale ?? false)
  // Feedback #100: one unified badge for every notification type (friend
  // added, feedback reply, event/camp comment) — replaces the earlier three
  // separate mechanisms (a friend-activity dot, a numbered feedback-reply
  // badge, and a dismissible "Follow them back" banner below the toolbar,
  // all removed). "The red dot here should only appear next to my profile
  // name, not the feedback tab" — see the tab bar in App.tsx, which no
  // longer carries its own dot either. Lives on the bell icon now, not the
  // avatar (see the file-level doc comment above).
  const unseenNotificationCount = user?.unseenNotificationCount ?? 0
  const showNotificationBadge = unseenNotificationCount > 0

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
      <div slot="end" style={{ display: 'flex', alignItems: 'center', gap: 20, paddingInlineEnd: 16 }}>
        <div
          role="button"
          aria-label="Notifications"
          onClick={() => history.push('/notifications')}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}
        >
          <IonIcon icon={notificationsOutline} style={{ fontSize: '1.5rem' }} />
          {showNotificationBadge && (
            <BadgeDot corner="top-right" label="New notifications" count={unseenNotificationCount} />
          )}
        </div>
        <div
          role="button"
          aria-label="Account"
          onClick={() => history.push('/account')}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}
        >
          {user && <Avatar url={user.avatarUrl} name={user.name} size={32} />}
          {showStaleBadge && <BadgeDot corner="top-right" label="Events/camps data needs a refresh" color="warning" />}
        </div>
      </div>
    </IonToolbar>
  )
}
