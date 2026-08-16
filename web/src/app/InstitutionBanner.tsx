import { IonButton, IonIcon, IonToolbar } from '@ionic/react'
import { closeOutline } from 'ionicons/icons'
import { Fragment } from 'react'
import { useHistory } from 'react-router-dom'

import { useDataFreshness } from '../admin/DataFreshnessContext'
import { useAuth } from '../auth/AuthContext'
import { markFriendsSeen } from '../connections/api'
import { Avatar } from '../uploads/Avatar'
import { BadgeDot } from './BadgeDot'

// Persistent workspace-style banner (Slack/ClassDojo pattern, feedback):
// institution identity (logo + name) on the left, the signed-in member's
// own picture on the right as the entry point to their account. Rendered
// once per page's IonHeader (Ionic supports stacking multiple IonToolbars
// in one header — the same mechanism EventsPage's segment row already
// uses), rather than hoisted above IonTabs globally, since ion-tabs'
// position: absolute/inset: 0 layout (see index.css's tab-bar-disappearing
// history) makes a truly global fixed banner risky to introduce.
export function InstitutionBanner() {
  const { user, isAdmin, refresh } = useAuth()
  const { freshness } = useDataFreshness()
  const history = useHistory()
  // Feedback #69: a quiet nudge that events/camps data has gone stale,
  // visible from anywhere without opening Dev Tools first — admin-only,
  // since only Ben acts on it.
  const showStaleBadge = isAdmin && (freshness?.is_stale ?? false)
  // Feedback #94: "see new friends... as a red icon" the moment you open
  // the app — same dot pattern as the stale-data badge above, but for every
  // member, not just admin. Positioned at the avatar's other corner so the
  // two badges never collide for an admin who has both at once. A second,
  // stacked IonToolbar (same mechanism this component's own doc comment
  // above already describes) doubles as the "maybe also a dismissal
  // banner" ask — shown on whatever page is open, not just the Friends
  // page itself, since the badge is meant to be seen "when you actually
  // open the app."
  const unseenFriendCount = user?.unseenFriendCount ?? 0
  const showFriendBadge = unseenFriendCount > 0
  // Feedback #98: a numbered badge (feedback #98's own "add a number... if
  // there are multiple" ask — see BadgeDot's own doc comment) at the
  // avatar's third corner, distinct from both badges above so all three can
  // show at once without colliding.
  const unseenFeedbackReplyCount = user?.unseenFeedbackReplyCount ?? 0
  const showFeedbackBadge = unseenFeedbackReplyCount > 0

  async function dismissFriendBanner() {
    await markFriendsSeen().catch((err) => console.error('failed to mark friends seen', err))
    await refresh()
  }

  return (
    <Fragment>
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
          style={{ display: 'flex', alignItems: 'center', paddingInlineEnd: 16, cursor: 'pointer', position: 'relative' }}
        >
          {user && <Avatar url={user.avatarUrl} name={user.name} size={32} />}
          {showStaleBadge && <BadgeDot corner="top-right" label="Events/camps data needs a refresh" />}
          {showFriendBadge && <BadgeDot corner="top-left" label="New friend activity" />}
          {showFeedbackBadge && (
            <BadgeDot corner="bottom-right" label="New feedback replies" count={unseenFeedbackReplyCount} />
          )}
        </div>
      </IonToolbar>
      {showFriendBadge && (
        <IonToolbar
          style={
            {
              '--background': 'var(--ion-color-light)',
              '--min-height': '36px',
              '--padding-top': '2px',
              '--padding-bottom': '2px',
            } as React.CSSProperties
          }
        >
          <div
            role="button"
            onClick={() => history.push('/friends')}
            style={{ display: 'flex', alignItems: 'center', paddingInlineStart: 16, fontSize: '0.875rem', cursor: 'pointer' }}
          >
            {unseenFriendCount === 1 ? '1 person started following you. ' : `${unseenFriendCount} people started following you. `}
            <span style={{ textDecoration: 'underline', fontWeight: 600, marginInlineStart: 4 }}>Follow them back</span>
          </div>
          <IonButton slot="end" fill="clear" size="small" onClick={dismissFriendBanner} aria-label="Dismiss">
            <IonIcon slot="icon-only" icon={closeOutline} />
          </IonButton>
        </IonToolbar>
      )}
    </Fragment>
  )
}
