#!/usr/bin/env node
// Regenerates public/soccer-math/qrcode.bundle.js — a standalone IIFE build
// of the real `qrcode` npm package (see qr-bundle-entry.js), checked into
// the repo like other pre-built assets (e.g. the app icon's generated
// per-platform variants). This is the ONE dependency public/soccer-math/
// has that isn't hand-written vanilla JS, and it's a real, repeatable
// build step rather than a one-off — rerun this whenever the `qrcode`
// package version changes in package.json.
//
// Verified (2026-09-10) with a real decode round-trip: generate a QR with
// this exact bundle in a real browser (Playwright), decode the resulting
// PNG with jsQR, and confirm it reads back the original URL — the same
// technique used to catch and reject an earlier hand-rolled QR encoder
// that produced QR-shaped output that didn't actually scan.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [path.join(dir, 'qr-bundle-entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  outfile: path.join(dir, '..', 'public', 'soccer-math', 'qrcode.bundle.js'),
})

console.log('Wrote public/soccer-math/qrcode.bundle.js')
