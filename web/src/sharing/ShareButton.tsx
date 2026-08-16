import {
  IonButton,
  IonButtons,
  IonContent,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { closeOutline, paperPlaneOutline, shareOutline } from 'ionicons/icons'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'

import { track } from '../analytics/api'
import { useAuth } from '../auth/AuthContext'
import { useQrDataUrl } from './useQrDataUrl'

// Persistent, always-visible share entry point (see CLAUDE.md "Sharing"):
// encodes whatever page the visitor is currently on, since sharing here means
// showing someone the QR in person, not distributing a link remotely. Doubles
// as the app's only invite mechanism — a logged-in member's QR always carries
// `?invite=<their user id>`, so scanning it as a non-member both takes you to
// that page AND records who invited you once you join (see JoinGate.tsx).
export function ShareButton() {
  const location = useLocation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  const params = new URLSearchParams(location.search)
  if (user) params.set('invite', user.id)
  const query = params.toString()
  const shareUrl = `${window.location.origin}${location.pathname}${query ? `?${query}` : ''}`

  // Only generate (or regenerate on navigation) while the modal is actually
  // open — passing null while closed is what keeps this from re-running on
  // every route change in the background.
  const qrDataUrl = useQrDataUrl(open ? shareUrl : null)

  function openModal() {
    setOpen(true)
    // Feedback #96's "who is sharing" — logged on open, not on an actual
    // scan/tap-through, since that's the moment a real share attempt
    // happened; there's no way to observe what a recipient does with it.
    track('share_opened', { path: location.pathname }).catch(() => {})
  }

  return (
    <>
      {/* Not IonFab/IonFabButton's usual in-IonContent placement — this button
          must persist across every page, not just one, so it sits outside the
          route-specific IonContent and anchors via .share-fab (index.css). */}
      <IonFabButton className="share-fab" color="light" onClick={openModal} aria-label="Share this page">
        <IonIcon icon={shareOutline} />
      </IonFabButton>
      <IonModal isOpen={open} onDidDismiss={() => setOpen(false)}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Share</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setOpen(false)}>
                <IonIcon slot="icon-only" icon={closeOutline} />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <div className="share-content">
            {/* Feedback, 2026-08-05: no reason to spell out a raw https://
                URL as plain text for a non-technical parent — the QR code,
                the instruction, and the share button below are the whole
                surface now. The link itself still lives in the QR encoding
                and the alt text (for accessibility/testing), just not
                rendered as visible text. */}
            {qrDataUrl && <img src={qrDataUrl} alt={`QR code for ${shareUrl}`} className="share-qr" />}
            {/* "Nettelhorst Bulbord", not bare "Nettelhorst" — same app-name
                convention as the join screen's own copy (see CLAUDE.md's
                Login section): naming both the community and the platform
                it runs on. */}
            <p style={{ fontWeight: 600, textAlign: 'center', margin: 0 }}>
              Have your friend scan this QR code to join Nettelhorst Bulbord
            </p>
            {/* Feature-detected (feedback #58: "make it easy to share over
                text or email") — opens the phone's own share sheet with this
                page's link, same real Messages/Mail/etc. apps a person would
                pick from the OS itself. Supported on the mobile Safari/Chrome
                this app actually targets (see CLAUDE.md's Platform strategy);
                not rendered where it's unsupported (e.g. a plain desktop
                browser) rather than showing a dead button. */}
            {typeof navigator.share === 'function' && (
              <>
                {/* Marks the button below as an alternative to scanning, not
                    a second unrelated action (feedback, 2026-08-05). */}
                <p style={{ color: 'var(--ion-color-medium)', margin: 0 }}>— or —</p>
                <IonButton expand="block" fill="outline" onClick={() => void navigator.share({ url: shareUrl }).catch(() => {})}>
                  <IonIcon slot="start" icon={paperPlaneOutline} />
                  Share via Text, Email, etc.
                </IonButton>
              </>
            )}
          </div>
        </IonContent>
      </IonModal>
    </>
  )
}
