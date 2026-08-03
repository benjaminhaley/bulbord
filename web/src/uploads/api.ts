import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export interface UploadedImage {
  image_url: string
  thumbnail_url: string
}

interface UploadResponse {
  data: UploadedImage
}

export async function uploadImage(file: File | Blob, folder?: 'feedback' | 'profiles' | 'events'): Promise<UploadedImage> {
  const form = new FormData()
  form.append('file', file)
  if (folder) form.append('folder', folder)

  const response = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!response.ok) {
    throw new Error(`Failed to upload image: ${response.status}`)
  }
  const body = (await response.json()) as UploadResponse
  return body.data
}
