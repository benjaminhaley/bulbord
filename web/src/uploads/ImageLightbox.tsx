import { IonButton, IonContent, IonIcon, IonModal } from '@ionic/react'
import { closeOutline } from 'ionicons/icons'

export function ImageLightbox({ src, onDismiss }: { src: string | null; onDismiss: () => void }) {
  return (
    <IonModal isOpen={!!src} onDidDismiss={onDismiss}>
      <IonContent style={{ '--background': '#000' } as React.CSSProperties}>
        <IonButton
          fill="clear"
          onClick={onDismiss}
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
        >
          <IonIcon slot="icon-only" icon={closeOutline} color="light" />
        </IonButton>
        {src && (
          <img
            src={src}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        )}
      </IonContent>
    </IonModal>
  )
}
