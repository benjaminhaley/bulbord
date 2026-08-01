import { useRef, useState } from 'react'

import { uploadImage, type UploadedImage } from './api'

// Shared by FeedbackPage's screenshot attach and JoinGate's profile-photo
// step — same hidden-file-input + upload-in-flight shape, just a different
// folder and a different place to put the result.
export function useImageUpload(folder: 'feedback' | 'profiles', onUploaded: (image: UploadedImage) => void) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function attach(file: File): Promise<boolean> {
    setUploading(true)
    try {
      onUploaded(await uploadImage(file, folder))
      return true
    } catch {
      return false
    } finally {
      setUploading(false)
    }
  }

  return { fileInputRef, uploading, attach }
}
