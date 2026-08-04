import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { getImageObject, imageUrl, uploadImage } from './storage.js'

// Bucket objects are private (Railway buckets have no public-URL mode), so
// every image is served through this proxy. Keys are content-addressed
// (uuid-based), so a long, immutable cache is always safe.
const UPLOAD_FOLDERS = ['feedback', 'profiles', 'events', 'camps'] as const
type UploadFolder = (typeof UPLOAD_FOLDERS)[number]

function isUploadFolder(value: unknown): value is UploadFolder {
  return typeof value === 'string' && (UPLOAD_FOLDERS as readonly string[]).includes(value)
}

export async function uploadsRoutes(app: FastifyInstance) {
  // Feedback screenshots and profile photos, plus (feedback #46) photos a
  // member attaches to their own event submission. Sourced/ingested event
  // images still bypass this route entirely — populated directly via
  // uploadImage() from the ingestion pipeline, which has no HTTP request to
  // attach a file to.
  app.post('/uploads', { preHandler: requireAuth }, async (request, reply) => {
    const file = await request.file()
    if (!file) {
      return reply.code(400).send({ error: { message: 'file is required' } })
    }

    const folderField = file.fields.folder
    const folderValue = !Array.isArray(folderField) && folderField?.type === 'field' ? folderField.value : undefined
    const folder = isUploadFolder(folderValue) ? folderValue : 'feedback'

    const buffer = await file.toBuffer()
    const { key, thumbnailKey } = await uploadImage(buffer, folder)

    return reply.code(201).send({
      data: { image_url: imageUrl(key), thumbnail_url: imageUrl(thumbnailKey) },
    })
  })

  app.get('/uploads/*', async (request, reply) => {
    const key = (request.params as { '*': string })['*']
    const object = await getImageObject(key)
    if (!object) {
      return reply.code(404).send({ error: { message: 'Image not found' } })
    }

    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    if (object.contentType) reply.type(object.contentType)
    return reply.send(object.body)
  })
}
