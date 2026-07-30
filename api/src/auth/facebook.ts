const GRAPH_VERSION = 'v21.0'

export interface FacebookProfile {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
}

export function facebookAuthorizeUrl(params: { appId: string; redirectUri: string; state: string }): string {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`)
  url.searchParams.set('client_id', params.appId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.state)
  url.searchParams.set('scope', 'email,public_profile')
  url.searchParams.set('response_type', 'code')
  return url.toString()
}

export async function exchangeFacebookCode(params: {
  appId: string
  appSecret: string
  redirectUri: string
  code: string
}): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`)
  url.searchParams.set('client_id', params.appId)
  url.searchParams.set('client_secret', params.appSecret)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('code', params.code)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Facebook token exchange failed: ${response.status}`)
  }
  const body = (await response.json()) as { access_token: string }
  return body.access_token
}

export async function fetchFacebookProfile(accessToken: string): Promise<FacebookProfile> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me`)
  url.searchParams.set('fields', 'id,name,email,picture')
  url.searchParams.set('access_token', accessToken)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Facebook profile fetch failed: ${response.status}`)
  }
  const body = (await response.json()) as {
    id: string
    name: string
    email?: string
    picture?: { data?: { url?: string } }
  }

  return {
    id: body.id,
    name: body.name,
    email: body.email ?? null,
    avatarUrl: body.picture?.data?.url ?? null,
  }
}
