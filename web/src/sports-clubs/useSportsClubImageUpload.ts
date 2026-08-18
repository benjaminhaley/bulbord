import { useState } from 'react'

import type { UploadedImage } from '../uploads/api'
import { useImageUpload } from '../uploads/useImageUpload'

// A member's own listing carries at most one photo, same posture as
// events'/camps' self-service posting — own copy, not shared.
export function useSportsClubImageUpload(initial: UploadedImage | null = null) {
  const [image, setImage] = useState<UploadedImage | null>(initial)
  const { fileInputRef, uploading, attach } = useImageUpload('sportsclubs', setImage)

  return { image, fileInputRef, uploading, attach, remove: () => setImage(null) }
}
