import type { FastifyInstance } from 'fastify'

import { exchangeFacebookCode, facebookAuthorizeUrl, fetchFacebookProfile } from './facebook.js'
import { bearerToken, requireAuth } from './plugin.js'
import {
  consumeLoginCode,
  createLoginCode,
  createSession,
  findOrCreateAdminBootstrapUser,
  findOrCreateUserFromFacebook,
  revokeSession,
} from './service.js'
import { createState, secretsMatch, verifyState } from './tokens.js'

interface AuthEnv {
  facebookAppId: string
  facebookAppSecret: string
  facebookCallbackUrl: string
  sessionSecret: string
  webUrl: string
}

function readEnv(): AuthEnv {
  const facebookAppId = process.env.FACEBOOK_APP_ID
  const facebookAppSecret = process.env.FACEBOOK_APP_SECRET
  const facebookCallbackUrl = process.env.FACEBOOK_CALLBACK_URL
  const sessionSecret = process.env.SESSION_SECRET
  const webUrl = process.env.WEB_URL

  if (!facebookAppId || !facebookAppSecret || !facebookCallbackUrl || !sessionSecret || !webUrl) {
    throw new Error(
      'Missing auth env vars: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_CALLBACK_URL, SESSION_SECRET, WEB_URL are all required',
    )
  }

  return { facebookAppId, facebookAppSecret, facebookCallbackUrl, sessionSecret, webUrl }
}

export async function authRoutes(app: FastifyInstance) {
  const env = readEnv()

  app.get('/auth/facebook', async (_request, reply) => {
    const state = createState(env.sessionSecret)
    const url = facebookAuthorizeUrl({
      appId: env.facebookAppId,
      redirectUri: env.facebookCallbackUrl,
      state,
    })
    return reply.redirect(url)
  })

  app.get('/auth/facebook/callback', async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string }

    if (query.error || !query.code || !query.state || !verifyState(query.state, env.sessionSecret)) {
      return reply.redirect(`${env.webUrl}/auth/callback?error=login_failed`)
    }

    try {
      const accessToken = await exchangeFacebookCode({
        appId: env.facebookAppId,
        appSecret: env.facebookAppSecret,
        redirectUri: env.facebookCallbackUrl,
        code: query.code,
      })
      const profile = await fetchFacebookProfile(accessToken)
      const user = await findOrCreateUserFromFacebook(profile)
      const { token, session } = await createSession(user.id)
      const code = await createLoginCode(session.id, token)

      return reply.redirect(`${env.webUrl}/auth/callback?code=${code}`)
    } catch (err) {
      request.log.error(err, 'facebook login failed')
      return reply.redirect(`${env.webUrl}/auth/callback?error=login_failed`)
    }
  })

  app.post('/auth/exchange', async (request, reply) => {
    const body = request.body as { code?: string }
    if (!body.code) {
      return reply.code(400).send({ error: { message: 'code is required' } })
    }

    const token = await consumeLoginCode(body.code)
    if (!token) {
      return reply.code(400).send({ error: { message: 'Invalid or expired code' } })
    }

    return reply.send({ data: { token } })
  })

  // Stopgap while Facebook OAuth is unavailable (see CLAUDE.md, Login section).
  // Unset ADMIN_LOGIN_PASSWORD in Railway to disable this route once Facebook login is restored.
  app.post('/auth/password-login', async (request, reply) => {
    const adminPassword = process.env.ADMIN_LOGIN_PASSWORD
    if (!adminPassword) {
      return reply.code(503).send({ error: { message: 'Password login is not enabled' } })
    }

    const body = request.body as { password?: string }
    if (!body.password || !secretsMatch(body.password, adminPassword)) {
      return reply.code(401).send({ error: { message: 'Invalid password' } })
    }

    const user = await findOrCreateAdminBootstrapUser()
    const { token } = await createSession(user.id)
    return reply.send({ data: { token } })
  })

  app.get('/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.currentUser!
    return reply.send({ data: { id: user.id, name: user.name, email: user.email, roles: user.roles } })
  })

  app.post('/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    await revokeSession(bearerToken(request)!)
    return reply.code(204).send()
  })
}
