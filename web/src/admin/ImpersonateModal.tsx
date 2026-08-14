import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonSpinner, IonTitle, IonToolbar } from '@ionic/react'
import { closeOutline, copyOutline } from 'ionicons/icons'
import { useState } from 'react'

import { useQrDataUrl } from '../sharing/useQrDataUrl'

export interface ImpersonationTarget {
  memberName: string
  url: string
  expiresAt: string
}

// Feedback #87: shows a generated impersonation link the same way
// ShareButton shows an invite link (QR code + copy) — reusing this app's
// already-established pattern (and its `useQrDataUrl` hook) for handing a
// URL to another device, rather than inventing a second one.
// `.share-content`/`.share-qr` are the same classes ShareButton.tsx uses.
export function ImpersonateModal({ target, onDismiss }: { target: ImpersonationTarget | null; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const qrDataUrl = useQrDataUrl(target?.url ?? null)

  async function copyLink() {
    if (!target) return
    await navigator.clipboard.writeText(target.url)
    setCopied(true)
  }

  return (
    <IonModal
      isOpen={target !== null}
      onDidDismiss={() => {
        setCopied(false)
        onDismiss()
      }}
    >
      <IonHeader>
        <IonToolbar>
          <IonTitle>Sign in as {target?.memberName}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onDismiss}>
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="share-content">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`Sign-in link for ${target?.memberName}`} className="share-qr" />
          ) : (
            <IonSpinner name="dots" />
          )}
          <p style={{ fontWeight: 600, textAlign: 'center', margin: 0 }}>Scan to open the app signed in as {target?.memberName}</p>
          {target && (
            <p style={{ color: 'var(--ion-color-medium)', textAlign: 'center', margin: 0 }}>
              Expires at {new Date(target.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
          <IonButton expand="block" fill="outline" onClick={() => void copyLink()}>
            <IonIcon slot="start" icon={copyOutline} />
            {copied ? 'Copied!' : 'Copy Link'}
          </IonButton>
        </div>
      </IonContent>
    </IonModal>
  )
}
