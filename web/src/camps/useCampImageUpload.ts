import { useState } from 'react'

import type { UploadedImage } from '../uploads/api'
import { useImageUpload } from '../uploads/useImageUpload'

// A member's own camp submission carries at most one photo, same posture as
// events' self-service posting — own copy, not shared.
export function useCampImageUpload(initial: UploadedImage | null = null) {
  const [image, setImage] = useState<UploadedImage | null>(initial)
  const { fileInputRef, uploading, attach } = useImageUpload('camps', setImage)

  // setImage exposed directly (feedback #141) so CampDetailPage's inline
  // editor can (re)seed this hook with the camp's current photo each time
  // edit mode starts — same shape as events/useEventImageUpload.ts.
  return { image, fileInputRef, uploading, attach, remove: () => setImage(null), setImage }
}
