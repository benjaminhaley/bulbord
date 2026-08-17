import { useState } from 'react'

import type { UploadedImage } from '../uploads/api'
import { useImageUpload } from '../uploads/useImageUpload'

// Feedback posts can carry more than one photo (feedback #40) — wraps the
// shared single-image useImageUpload hook (also used by the profile-photo
// step) to manage an ordered array instead of replacing a single value.
export function useMultiImageUpload(initial: UploadedImage[] = []) {
  const [images, setImages] = useState<UploadedImage[]>(initial)
  const { fileInputRef, uploading, attach } = useImageUpload('feedback', (image) =>
    setImages((prev) => [...prev, image]),
  )

  async function attachFiles(files: Iterable<File>): Promise<void> {
    await Promise.all(Array.from(files).map((file) => attach(file)))
  }

  function removeAt(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  // For a composer that stays mounted after a successful post (e.g.
  // CommentsSection.tsx's reply box, unlike FeedbackForm's new-post form,
  // which unmounts on submit and so never needed this) — clears the
  // attached set back to empty rather than removing one at a time.
  function reset() {
    setImages([])
  }

  return { images, fileInputRef, uploading, attachFiles, removeAt, reset }
}
