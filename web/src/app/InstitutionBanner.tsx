import { IonButton, IonIcon, IonToolbar } from '@ionic/react'
import { notificationsOutline } from 'ionicons/icons'
import { useHistory } from 'react-router-dom'

import { useDataFreshness } from '../admin/DataFreshnessContext'
import { useAuth } from '../auth/AuthContext'
import { unstyledButtonStyle } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { BadgeDot } from './BadgeDot'

// This banner's own text/icons need to read in --banner-ink (the light color
// against the dark banner background), not unstyledButtonStyle's generic
// `color: 'inherit'` — IonButton defaults to --ion-color-primary regardless
// of an ancestor IonToolbar's own custom --color property unless told
// otherwise (Ionic's "in-toolbar" color inheritance only kicks in for its
// own --ion-toolbar-color convention, not an arbitrary custom property name
// like --banner-ink), confirmed live (measured blue text before this).
const bannerButtonStyle = { ...unstyledButtonStyle, '--color': 'var(--banner-ink)' } as React.CSSProperties

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

  // Every tap target here used to be a bare `<div role="button" onClick>` —
  // visually fine, but not actually keyboard-operable (no tabIndex, no
  // Enter/Space handling despite the role claiming otherwise) and missing
  // the focus ring/ripple every real Ionic control gets for free. Found in a
  // 2026-08-22 audit prompted by a real cross-browser bug elsewhere in this
  // app (see CLAUDE.md's Login section, CropModal) — that bug wasn't
  // actually caused by skipping Ionic (Ionic has no crop component to skip),
  // but the audit it prompted found this real, separate class of issue:
  // hand-rolled clickable divs standing in for a real interactive component
  // Ionic already provides. `IonButton fill="clear"` + `bannerButtonStyle`
  // strips Material's default uppercase/padding/min-height chrome back down
  // to the original plain-icon/plain-text look, while still rendering a
  // real button element underneath — keyboard, focus ring, and ripple all
  // come free, no hand-added ARIA/keydown plumbing needed.
  return (
    <IonToolbar style={{ '--background': 'var(--banner-bg)', '--color': 'var(--banner-ink)' } as React.CSSProperties}>
      <IonButton
        slot="start"
        fill="clear"
        onClick={() => history.push('/about')}
        style={{ ...bannerButtonStyle, paddingInlineStart: 16 }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/nettelhorst-logo.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Nettelhorst Bulbord</span>
        </span>
      </IonButton>
      <div slot="end" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInlineEnd: 8 }}>
        <IonButton fill="clear" aria-label="Notifications" onClick={() => history.push('/notifications')} style={bannerButtonStyle}>
          <span style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <IonIcon icon={notificationsOutline} style={{ fontSize: '1.5rem' }} />
            {showNotificationBadge && (
              <BadgeDot corner="top-right" label="New notifications" count={unseenNotificationCount} />
            )}
          </span>
        </IonButton>
        <IonButton fill="clear" aria-label="Account" onClick={() => history.push('/account')} style={bannerButtonStyle}>
          <span style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            {user && <Avatar url={user.avatarUrl} name={user.name} size={32} />}
            {showStaleBadge && <BadgeDot corner="top-right" label="Events/camps data needs a refresh" color="warning" />}
          </span>
        </IonButton>
      </div>
    </IonToolbar>
  )
}
