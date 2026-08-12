import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sirv from 'sirv'

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const assets = sirv(distDir, { single: true })

// sirv (and the `mime` package underneath it) infers Content-Type from file
// extension — apple-app-site-association and assetlinks.json are served
// with none by Apple/Google's own convention, so they'd otherwise get no
// (or a wrong) Content-Type. iOS's native Associated Domains verification
// (Universal Links, and WebAuthn's RP-ID domain check for the native app —
// see CLAUDE.md's Login section) actually depends on this being valid
// application/json, unlike a plain website passkey flow which never touches
// AASA at all — this went unnoticed until the native app needed it.
const JSON_WELL_KNOWN_FILES = {
  '/.well-known/apple-app-site-association': path.join(distDir, '.well-known/apple-app-site-association'),
  '/.well-known/assetlinks.json': path.join(distDir, '.well-known/assetlinks.json'),
}

const server = createServer((req, res) => {
  const filePath = JSON_WELL_KNOWN_FILES[req.url]
  if (filePath) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(readFileSync(filePath))
    return
  }
  assets(req, res)
})

const port = process.env.PORT || 3000
server.listen(port, '0.0.0.0', () => {
  console.log(`listening on ${port}`)
})
