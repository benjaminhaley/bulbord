import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { getImageObject, imageUrl, uploadImage } from './storage.js'

// Bucket objects are private (Railway buckets have no public-URL mode), so
// every image is served through this proxy. Keys are content-addressed
// (uuid-based), so a long, immutable cache is always safe.
export async function uploadsRoutes(app: FastifyInstance) {
  // Feedback screenshots today. Event images are populated by the ingestion
  // pipeline directly via uploadImage(), not through this route — add a
  // folder param here if a second HTTP caller shows up.
  app.post('/uploads', { preHandler: requireAuth }, async (request, reply) => {
    const file = await request.file()
    if (!file) {
      return reply.code(400).send({ error: { message: 'file is required' } })
    }

    const buffer = await file.toBuffer()
    const { key, thumbnailKey } = await uploadImage(buffer, 'feedback')

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
