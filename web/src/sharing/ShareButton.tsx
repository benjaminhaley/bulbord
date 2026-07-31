import {
  IonButton,
  IonButtons,
  IonContent,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonModal,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { closeOutline, shareOutline } from 'ionicons/icons'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import QRCode from 'qrcode'

// Persistent, always-visible share entry point (see CLAUDE.md "Sharing"):
// encodes whatever page the visitor is currently on, since sharing here means
// showing someone the QR in person, not distributing a link remotely.
export function ShareButton() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const qrCache = useRef<{ url: string; dataUrl: string } | null>(null)

  const shareUrl = `${window.location.origin}${location.pathname}${location.search}`

  useEffect(() => {
    if (!open) return
    if (qrCache.current?.url === shareUrl) {
      setQrDataUrl(qrCache.current.dataUrl)
      return
    }
    let cancelled = false
    QRCode.toDataURL(shareUrl, { width: 320, margin: 1 }).then((dataUrl) => {
      qrCache.current = { url: shareUrl, dataUrl }
      if (!cancelled) setQrDataUrl(dataUrl)
    })
    return () => {
      cancelled = true
    }
  }, [open, shareUrl])

  return (
    <>
      {/* Not IonFab/IonFabButton's usual in-IonContent placement — this button
          must persist across every page, not just one, so it sits outside the
          route-specific IonContent and anchors via .share-fab (index.css). */}
      <IonFabButton className="share-fab" onClick={() => setOpen(true)} aria-label="Share this page">
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
        <IonContent className="ion-padding ion-text-center">
          {qrDataUrl && <img src={qrDataUrl} alt="QR code for this page" className="share-qr" />}
          <IonNote>{shareUrl}</IonNote>
        </IonContent>
      </IonModal>
    </>
  )
}
