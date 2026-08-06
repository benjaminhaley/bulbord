import { IonButton, IonContent, IonHeader, IonModal, IonRange, IonTitle, IonToolbar } from '@ionic/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'

// Crop/zoom step for the profile-photo picker only (feedback #56) — a fixed
// circular avatar is the one upload flow where an exact crop actually
// matters; feedback/event/camp photos render at flexible aspect ratios and
// don't get this treatment (confirmed with Ben, 2026-08-05).
async function getCroppedImageFile(imageSrc: string, cropArea: Area, fileName: string, fileType: string): Promise<File> {
  const image = new Image()
  image.src = imageSrc
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
  })

  const canvas = document.createElement('canvas')
  canvas.width = cropArea.width
  canvas.height = cropArea.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, cropArea.x, cropArea.y, cropArea.width, cropArea.height, 0, 0, cropArea.width, cropArea.height)

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
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const croppedAreaRef = useRef<Area | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!file) {
      setImageSrc(null)
      return
    }
    const url = URL.createObjectURL(file)
    setImageSrc(url)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    croppedAreaRef.current = croppedAreaPixels
  }, [])

  async function save() {
    if (!imageSrc || !file || !croppedAreaRef.current) return
    setSaving(true)
    try {
      const cropped = await getCroppedImageFile(imageSrc, croppedAreaRef.current, file.name, file.type || 'image/jpeg')
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
        <div style={{ position: 'relative', width: '100%', height: '70vh', background: '#000' }}>
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>
        <div className="ion-padding">
          <IonRange min={1} max={3} step={0.01} value={zoom} onIonInput={(e) => setZoom(Number(e.detail.value))} />
          <IonButton expand="block" disabled={saving} onClick={save}>
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
