import { IonButton, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/react'
import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

// Crop step for the profile-photo picker only (feedback #56) — a fixed
// circular avatar is the one upload flow where an exact crop actually
// matters; feedback/event/camp photos render at flexible aspect ratios and
// don't get this treatment (confirmed with Ben, 2026-08-05).
//
// Uses react-image-crop's drag-to-select/resize box over the full photo —
// the standard cropping interaction (GitHub, Slack, etc. avatar uploaders
// all use this shape) — rather than a fixed frame you pan/zoom the image
// within. Reversed from an earlier react-easy-crop-based version per direct
// feedback: "you expect to be able to highlight an area... pretty standard
// to have this kind of image cropping for a profile picture." Zooming in is
// just shrinking the selection box (the crop math always reads from the
// image's full natural resolution regardless of box size), so there's no
// separate zoom control to learn. `aspect={1}` keeps the box always square
// (so the output stays a square file, matching Avatar's circular CSS
// treatment of it elsewhere) while `circularCrop` renders the selection
// overlay itself as a circle, so it's visually obvious what the final
// avatar will look like while still being freely draggable/resizable.

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(makeAspectCrop({ unit: '%', width: 90 }, aspect, mediaWidth, mediaHeight), mediaWidth, mediaHeight)
}

async function getCroppedImageFile(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  fileName: string,
  fileType: string,
): Promise<File> {
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height
  const cropWidth = pixelCrop.width * scaleX
  const cropHeight = pixelCrop.height * scaleY

  const canvas = document.createElement('canvas')
  canvas.width = cropWidth
  canvas.height = cropHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, pixelCrop.x * scaleX, pixelCrop.y * scaleY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, fileType, 0.92))
  if (!blob) throw new Error('Could not crop image')
  return new File([blob], fileName, { type: fileType })
}

export function CropModal({
  file,
  onCancel,
  onCropped,
}: {
  file: File | null
  onCancel: () => void
  onCropped: (file: File) => void
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [saving, setSaving] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!file) {
      setImageSrc(null)
      return
    }
    const url = URL.createObjectURL(file)
    setImageSrc(url)
    setCrop(undefined)
    setCompletedCrop(undefined)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function onImageLoad(e: SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    const initial = centerAspectCrop(width, height, 1)
    setCrop(initial)
  }

  async function save() {
    if (!imgRef.current || !completedCrop?.width || !file) return
    setSaving(true)
    try {
      const cropped = await getCroppedImageFile(imgRef.current, completedCrop, file.name, file.type || 'image/jpeg')
      onCropped(cropped)
    } finally {
      setSaving(false)
    }
  }

  return (
    <IonModal isOpen={!!file} onDidDismiss={onCancel}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Crop photo</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh', background: '#000' }}>
          {imageSrc && (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
              aspect={1}
              circularCrop
              keepSelection
            >
              {/* eslint-disable-next-line jsx-a11y/alt-text -- decorative, cropped into a profile photo the user just picked */}
              <img ref={imgRef} src={imageSrc} onLoad={onImageLoad} style={{ maxHeight: '68vh', maxWidth: '100%' }} />
            </ReactCrop>
          )}
        </div>
        <div className="ion-padding">
          <IonButton expand="block" disabled={saving || !completedCrop?.width} onClick={save}>
            Use Photo
          </IonButton>
          <IonButton expand="block" fill="clear" disabled={saving} onClick={onCancel}>
            Cancel
          </IonButton>
        </div>
      </IonContent>
    </IonModal>
  )
}
