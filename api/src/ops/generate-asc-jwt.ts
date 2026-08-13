import { createSign } from 'node:crypto'

// Reusable, not a one-off script (see api/knip.json's src/ops/*.ts entry) --
// mints a fresh App Store Connect API JWT (they expire after ~20 min, so a
// new one is needed per session) from the durable credentials stored as
// Railway env vars on the api service (ASC_KEY_ID / ASC_ISSUER_ID /
// ASC_KEY_CONTENT -- get them with:
//   railway variables --service api --environment production --kv
// and export the three ASC_* values before running this script). See
// CLAUDE.md's Platform strategy for what this JWT is used for (checking
// App Store review status, managing builds/screenshots/submissions, etc.
// via direct REST calls) and why these live here rather than only in a
// session's transcript.
const keyId = process.env.ASC_KEY_ID
const issuerId = process.env.ASC_ISSUER_ID
const privateKeyPem = process.env.ASC_KEY_CONTENT

if (!keyId || !issuerId || !privateKeyPem) {
  console.error('Set ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_CONTENT in the environment first.')
  process.exit(1)
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
const now = Math.floor(Date.now() / 1000)
const payload = { iss: issuerId, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }

const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`

const sign = createSign('SHA256')
sign.update(signingInput)
sign.end()
const signature = sign.sign({ key: privateKeyPem, dsaEncoding: 'ieee-p1363' })

console.log(`${signingInput}.${base64url(signature)}`)
