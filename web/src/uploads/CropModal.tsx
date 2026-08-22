import { IonButton, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/react'
import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import ReactCrop, { centerCrop, convertToPixelCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop'
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
  // getBoundingClientRect(), not the .width/.height IDL properties — see
  // onImageLoad's own comment below for why those can't be trusted (a real
  // WebKit race), and why this has to agree with whatever frame of
  // reference onImageLoad used to build completedCrop in the first place.
  const { width: renderedWidth, height: renderedHeight } = image.getBoundingClientRect()
  const scaleX = image.naturalWidth / renderedWidth
  const scaleY = image.naturalHeight / renderedHeight
  const cropWidth = pixelCrop.width * scaleX
  const cropHeight = pixelCrop.height * scaleY

  // ionic-exception: Ionic has no canvas/image-cropping component; a real
  // <canvas> is the only way to rasterize a cropped region of an image.
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

  // Two distinct races live here, both stemming from the same root cause —
  // this modal's content (including the just-loaded <img>) can still be
  // mid-layout (IonModal's open animation hasn't been flushed by the
  // browser yet) at the exact instant 'load' fires — found 2026-08-21 while
  // investigating a real onboarding-blocking bug on Safari/iOS, reported as
  // "no way to actually submit the picture":
  //
  // 1. The bare .width/.height IDL properties can fall back to the image's
  //    *natural* size instead of its CSS-rendered size when layout hasn't
  //    flushed — reproduced directly with Playwright's real WebKit browser
  //    (~3 of 5 runs hit it): a 3024x4032 photo rendered at 339x452
  //    sometimes reported onImageLoad's dimensions as 3024x4032 instead.
  //    That corrupts completedCrop (computed below in whatever space
  //    width/height happened to be in) into natural-pixel units;
  //    getCroppedImageFile then multiplies it *again* by
  //    naturalSize/renderedSize, over-scaling the crop rect past WebKit's
  //    ~16384x16384 canvas area cap and silently failing canvas.toBlob() —
  //    permanently disabling Continue, since avatarUrl never gets set.
  //    getBoundingClientRect() forces a layout flush, so it can't return a
  //    stale/wrong-space size the way the bare IDL properties can.
  //
  // 2. Even getBoundingClientRect() can legitimately read 0x0 if layout for
  //    this element hasn't happened *at all* yet — the exact race the
  //    comment below already flagged for ReactCrop's own auto-complete (a
  //    CI-only failure at the time), which turns out to affect this
  //    directly-computed fallback too, once (1) stopped masking it in
  //    practice. A single measurement attempt can't tell "genuinely zero"
  //    apart from "not laid out yet", so retry on the next animation frame
  //    until a real, nonzero box shows up, rather than computing a crop
  //    against a degenerate one.
  function measureAndSetInitialCrop(img: HTMLImageElement) {
    if (!img.isConnected) return
    const { width, height } = img.getBoundingClientRect()
    if (width === 0 || height === 0) {
      requestAnimationFrame(() => measureAndSetInitialCrop(img))
      return
    }
    const initial = centerAspectCrop(width, height, 1)
    setCrop(initial)
    // Also set the completed pixel crop directly, from the image's own
    // just-known dimensions — don't rely solely on ReactCrop's internal
    // auto-complete (it fires once, on the crop prop's first
    // undefined -> set transition, using the crop box's live
    // getBoundingClientRect() at that instant, subject to the same race
    // described above).
    setCompletedCrop(convertToPixelCrop(initial, width, height))
  }

  function onImageLoad(e: SyntheticEvent<HTMLImageElement>) {
    measureAndSetInitialCrop(e.currentTarget)
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
