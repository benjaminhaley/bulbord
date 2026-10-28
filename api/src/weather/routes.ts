import type { FastifyInstance } from 'fastify'

import { publicRead } from '../auth/public-read.js'
import { getForecast } from './service.js'

// Public like the listings it decorates; nothing about people in it.
export async function weatherRoutes(app: FastifyInstance) {
  app.get('/weather/forecast', publicRead, async (_request, reply) => {
    const forecast = await getForecast()
    return reply.send({ data: forecast })
  })
}
