#!/usr/bin/env node
// Extracts real computed styles (font-size, weight, color, margins,
// padding, x/y position) for every text-bearing element across Bulbord's
// main screens — the tool behind the feedback #70 style-audit passes
// (see CLAUDE.md's Status-of-decisions entries and STYLE_GUIDE.md's
// Intentionality section). Built and then thrown away as scratch scripts
// three times in one session before it was worth keeping: a future style
// pass (by Claude or by hand) should start from this, not re-derive the
// extraction technique from zero.
//
// This script only gathers evidence — it does not decide what's wrong.
// Deciding whether a difference is justified needs the actual reasoning
// (reading the component's code, checking CLAUDE.md's feedback history),
// which is exactly what a script can't do — see STYLE_GUIDE.md's
// Intentionality section for the one-sentence-reason test to apply by hand
// to whatever this turns up.
//
// Usage:
//   node scripts/style-audit.mjs <sessionToken> [baseUrl]
//
// sessionToken: mint one against the target environment, e.g. locally:
//   cd api && npx tsx -e "
//     import { createSession } from './src/auth/service.js'
//     console.log((await createSession('<user-id>')).token)
//   "
// baseUrl: defaults to the live production app. Pass http://localhost:5173
// (with the local dev stack running) to audit local changes before they
// ship — CLAUDE.md's Camps/Events seed scripts populate realistic data.
//
// Output: <outDir>/<page>.json (structured style data) and
// <outDir>/<page>.png (full-page screenshot) per route, where outDir is
// ./style-audit-out (gitignored — this is a diagnostic tool, not a report
// generator; the actual audit reports this produced were published as
// Artifacts, not committed to the repo).

import { chromium } from 'playwright'
import fs from 'node:fs'

const TOKEN = process.argv[2]
const BASE = process.argv[3] ?? 'https://nettelhorst.bulbord.com'
const OUT = new URL('../style-audit-out/', import.meta.url).pathname

if (!TOKEN) {
  console.error('Usage: node scripts/style-audit.mjs <sessionToken> [baseUrl]')
  process.exit(1)
}

fs.mkdirSync(OUT, { recursive: true })

// Every element type that's ever carried real page content in an audit so
// far — extend this list rather than narrowing it if a future pass needs
// to check something new (e.g. a form input's placeholder styling).
const SELECTOR =
  'h1,h2,h3,p,a,span,li,td,th,button,ion-button,ion-badge,ion-note,ion-icon,ion-label,hr,img,ion-item'

const EXTRACT = (selector) => {
  const els = Array.from(document.querySelectorAll(selector))
  const out = []
  for (const el of els) {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    const cs = getComputedStyle(el)
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    out.push({
      tag: el.tagName.toLowerCase(),
      text,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      color: cs.color,
      lineHeight: cs.lineHeight,
      marginTop: cs.marginTop,
      marginBottom: cs.marginBottom,
      marginLeft: cs.marginLeft,
      paddingLeft: cs.paddingLeft,
      paddingTop: cs.paddingTop,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      right: Math.round(rect.x + rect.width),
      bottom: Math.round(rect.y + rect.height),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    })
  }
  return out
}

// One representative route per screen shape — extend this list as new
// screens get built, rather than trying to enumerate every possible
// detail-page id. Swap in real ids for the two detail routes against
// whatever environment BASE points at.
const PAGES = [
  ['events-list', '/events'],
  ['camps-list', '/camps'],
  ['feedback', '/feedback'],
  ['account', '/account'],
  ['about', '/about'],
  ['admin-users', '/admin/users'],
]

async function main() {
  const browser = await chromium.launch()
  // 4x device scale factor — this codebase's own established precision
  // for pixel-level measurement (spacing gaps, ink-centroid alignment
  // checks), not just a screenshot resolution choice.
  const context = await browser.newContext({ viewport: { width: 390, height: 3400 }, deviceScaleFactor: 4 })
  const page = await context.newPage()
  await page.goto(`${BASE}/?signInToken=${TOKEN}`)
  await page.waitForTimeout(1500)

  for (const [name, route] of PAGES) {
    await page.goto(`${BASE}${route}`)
    await page.waitForTimeout(1200)
    const data = await page.evaluate(EXTRACT, SELECTOR)
    fs.writeFileSync(`${OUT}${name}.json`, JSON.stringify(data, null, 1))
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true })
    console.log('captured', name, `(${data.length} elements)`)
  }

  await browser.close()
  console.log(`\nDone — output in ${OUT}`)
}

await main()
