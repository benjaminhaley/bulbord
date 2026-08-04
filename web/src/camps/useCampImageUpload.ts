import { useState } from 'react'

import type { UploadedImage } from '../uploads/api'
import { useImageUpload } from '../uploads/useImageUpload'

// A member's own camp submission carries at most one photo, same posture as
// events' self-service posting — own copy, not shared.
export function useCampImageUpload(initial: UploadedImage | null = null) {
  const [image, setImage] = useState<UploadedImage | null>(initial)
  const { fileInputRef, uploading, attach } = useImageUpload('camps', setImage)

  return { image, fileInputRef, uploading, attach, remove: () => setImage(null) }
}
