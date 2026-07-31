import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'

import { requireEnv } from '../env.js'

const THUMBNAIL_WIDTH = 400
const FULL_IMAGE_MAX_WIDTH = 2000

const bucket = requireEnv('UPLOADS_BUCKET')
// Local dev shares the production bucket, namespaced under this prefix so
// dev uploads never collide with real objects. Empty in production.
const keyPrefix = process.env.UPLOADS_KEY_PREFIX ?? ''

const client = new S3Client({
  endpoint: requireEnv('UPLOADS_ENDPOINT'),
  region: process.env.UPLOADS_REGION || 'auto',
  credentials: {
    accessKeyId: requireEnv('UPLOADS_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('UPLOADS_SECRET_ACCESS_KEY'),
  },
})

function prefixedKey(key: string): string {
  return `${keyPrefix}${key}`
}

async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: prefixedKey(key), Body: body, ContentType: contentType }))
}

export interface UploadedImage {
  key: string
  thumbnailKey: string
}

// Resizes/re-orients but keeps the original format for the full image;
// the thumbnail is always JPEG since it's for compact list/card display only.
export async function uploadImage(buffer: Buffer, folder: string): Promise<UploadedImage> {
  const id = randomUUID()
  const base = sharp(buffer).rotate()
  const { format = 'jpeg' } = await base.metadata()
  const contentType = `image/${format}`

  const [fullBuffer, thumbnailBuffer] = await Promise.all([
    base.clone().resize({ width: FULL_IMAGE_MAX_WIDTH, withoutEnlargement: true }).toBuffer(),
    base.clone().resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(),
  ])

  const key = `${folder}/${id}.${format}`
  const thumbnailKey = `${folder}/${id}-thumb.jpg`

  await Promise.all([putObject(key, fullBuffer, contentType), putObject(thumbnailKey, thumbnailBuffer, 'image/jpeg')])

  return { key, thumbnailKey }
}

export interface StoredObject {
  body: Readable
  contentType?: string
  contentLength?: number
}

export async function getImageObject(key: string): Promise<StoredObject | null> {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: prefixedKey(key) }))
    return {
      body: result.Body as Readable,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'NoSuchKey') return null
    throw err
  }
}

export function imageUrl(key: string | null): string | null {
  return key ? `/uploads/${key}` : null
}
