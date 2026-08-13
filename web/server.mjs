import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sirv from 'sirv'

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const assets = sirv(distDir, { single: true })
const indexHtml = readFileSync(path.join(distDir, 'index.html'), 'utf-8')

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

// Feedback #73: a link a member shares (iMessage, WhatsApp, Slack, etc.)
// should preview as that specific event/camp, not a generic Bulbord link.
// The crawler that builds that preview fetches the page with no session —
// it's not a member, can't run the SPA's JS, and never will be — so the
// only way to give it real content is to inject meta tags into the HTML
// itself, server-side, before it goes out. This calls the public,
// unauthenticated GET /events/:id/preview-meta / GET /camps/:id/preview-meta
// endpoints added alongside this (see api/src/events/routes.ts,
// api/src/camps/routes.ts) — deliberately the only event/camp data
// reachable from this app without a session, and deliberately narrow
// (title/description/image only).
const PREVIEWABLE_ROUTES = [
  { pattern: /^\/events\/([^/]+)\/?$/, resource: 'events' },
  { pattern: /^\/camps\/([^/]+)\/?$/, resource: 'camps' },
]

const API_URL = process.env.VITE_API_URL

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

// Only known to fill in dynamically once fetched — kept out of index.html's
// own static defaults, unlike og:title/og:description above, so there's
// never a placeholder/broken image tag on a page with no real photo (same
// "no fake substitute" posture CLAUDE.md's Images section already applies
// to event/camp images themselves).
function buildPreviewHtml(pageUrl, meta) {
  const title = escapeHtml(`${meta.title} · Nettelhorst Bulbord`)
  const description = escapeHtml(truncate(meta.description?.trim() || 'See details on Nettelhorst Bulbord', 200))
  const imageUrl = meta.image_url ? escapeHtml(`${API_URL}${meta.image_url}`) : null

  const tags = [
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    imageUrl ? `<meta property="og:image" content="${imageUrl}" />` : '',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />`,
    imageUrl ? `<meta name="twitter:image" content="${imageUrl}" />` : '',
  ]
    .filter(Boolean)
    .join('\n    ')

  // Replaces the whole default og:title..twitter:card block from index.html
  // (including that trailing static twitter:card line) so nothing from the
  // static defaults survives alongside the dynamic tags — a leftover
  // duplicate meta tag (e.g. two conflicting twitter:card values) is
  // exactly the kind of thing a crawler's behavior on is undefined.
  return indexHtml
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta property="og:title"[^>]*\/>\n\s*<meta property="og:description"[^>]*\/>\n\s*<meta name="twitter:card"[^>]*\/>/, tags)
}

async function tryServePreview(req, res) {
  const url = new URL(req.url, 'http://internal')
  for (const { pattern, resource } of PREVIEWABLE_ROUTES) {
    const match = url.pathname.match(pattern)
    if (!match || !API_URL) continue
    try {
      const response = await fetch(`${API_URL}/${resource}/${match[1]}/preview-meta`, { signal: AbortSignal.timeout(3000) })
      if (!response.ok) return false
      const { data } = await response.json()
      const pageUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}${req.url}`
      const html = buildPreviewHtml(pageUrl, data)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return true
    } catch {
      return false
    }
  }
  return false
}

const server = createServer(async (req, res) => {
  const filePath = JSON_WELL_KNOWN_FILES[req.url]
  if (filePath) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(readFileSync(filePath))
    return
  }
  if (await tryServePreview(req, res)) return
  assets(req, res)
})

const port = process.env.PORT || 3000
server.listen(port, '0.0.0.0', () => {
  console.log(`listening on ${port}`)
})
