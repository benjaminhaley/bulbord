import { IonIcon } from '@ionic/react'
import { chatbubbleOutline } from 'ionicons/icons'

import { useAuth } from '../auth/AuthContext'
import { BadgeDot } from './BadgeDot'

// Feedback #98: a plain red dot on the Feedback tab bar icon itself when a
// reply has landed on something the viewer posted — no count here (that
// lives on the avatar badge instead, see InstitutionBanner.tsx), since a
// small tab-bar icon has no room for a legible number.
export function FeedbackTabIcon() {
  const { user } = useAuth()
  const showBadge = (user?.unseenFeedbackReplyCount ?? 0) > 0

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <IonIcon icon={chatbubbleOutline} />
      {showBadge && <BadgeDot corner="top-right" label="New feedback replies" borderColor="var(--ion-tab-bar-background, #fff)" />}
    </div>
  )
}
