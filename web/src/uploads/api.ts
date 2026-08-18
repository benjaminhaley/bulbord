import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export interface UploadedImage {
  image_url: string
  thumbnail_url: string
}

interface UploadResponse {
  data: UploadedImage
}

export async function uploadImage(
  file: File | Blob,
  folder?: 'feedback' | 'profiles' | 'events' | 'camps' | 'sportsclubs',
): Promise<UploadedImage> {
  // Field order matters here: @fastify/multipart's request.file() only sees
  // fields that arrived before the file part in the multipart stream, so a
  // large enough file can make the server resolve the file before ever
  // reaching 'folder' below it — silently defaulting to the 'feedback'
  // folder regardless of what was actually requested (found 2026-08-04 while
  // re-uploading camp images through this same route). 'folder' must be
  // appended first.
  const form = new FormData()
  if (folder) form.append('folder', folder)
  form.append('file', file)

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
