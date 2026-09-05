import { useState } from 'react'

import type { UploadedImage } from '../uploads/api'
import { useImageUpload } from '../uploads/useImageUpload'

// A member's own event submission carries at most one photo (feedback #46)
// — the events schema still has a single image_url/thumbnail_url pair (no
// per-event images table like feedback_images), so a single-value wrapper
// around the shared upload hook is enough, unlike feedback's array-based
// useMultiImageUpload.
export function useEventImageUpload(initial: UploadedImage | null = null) {
  const [image, setImage] = useState<UploadedImage | null>(initial)
  const { fileInputRef, uploading, attach } = useImageUpload('events', setImage)

  // Exposed directly (not just remove()) so a caller can apply an image
  // found some other way than the file picker — e.g. EventForm's own
  // imageSuggestion prop (feedback #133's description-flow photo search),
  // which resolves after mount and isn't a file attach at all.
  return { image, fileInputRef, uploading, attach, remove: () => setImage(null), setImage }
}
