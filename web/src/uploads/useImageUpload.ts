import { useRef, useState } from 'react'

import { uploadImage, type UploadedImage } from './api'

// Shared by FeedbackPage's screenshot attach, JoinGate's profile-photo step,
// and the event-submission form's photo attach — same hidden-file-input +
// upload-in-flight shape, just a different folder and a different place to
// put the result.
export function useImageUpload(folder: 'feedback' | 'profiles' | 'events', onUploaded: (image: UploadedImage) => void) {
  // A count, not a flag: feedback's multi-photo picker can have several
  // attach() calls in flight together, and a flag would flicker to "done"
  // as soon as the first of several parallel uploads finished.
  const [inFlightCount, setInFlightCount] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function attach(file: File): Promise<boolean> {
    setInFlightCount((n) => n + 1)
    try {
      onUploaded(await uploadImage(file, folder))
      return true
    } catch {
      return false
    } finally {
      setInFlightCount((n) => n - 1)
    }
  }

  return { fileInputRef, uploading: inFlightCount > 0, attach }
}
