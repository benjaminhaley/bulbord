#!/usr/bin/env node
// Fails if web/src contains a hand-rolled stand-in for something Ionic's
// component library already provides (a `<div onClick>` doing a button's
// job, a raw `<input type="checkbox">`, etc.) or a raw HTML primitive Ionic
// has no equivalent for at all (a file input, a <canvas>) — UNLESS it's
// marked with an explicit `ionic-exception: <reason>` comment nearby.
//
// Why this exists: a 2026-08-22 audit (prompted by a real cross-browser bug,
// not caused by this pattern itself — see CLAUDE.md's Login section,
// "Profile photo crop") found several components using a bare
// `<div role="button" onClick>` instead of a real IonButton/IonItem, with no
// comment explaining why — each one silently missing keyboard operability, a
// focus ring, and ripple that Ionic gives a real button for free (see
// CLAUDE.md's Design system section: "use Ionic's built-in components...
// don't hand-roll UI primitives Ionic already provides"). This script is
// what actually enforces that rule going forward, the same way
// check-format-parity.mjs enforces the format.ts/newsletter sync rule — a
// prose comment in CLAUDE.md doesn't stop a future accidental regression,
// a CI check run on every push does.
//
// This does NOT mean "never use a raw HTML element" — Ionic has no crop UI,
// no file picker, no <canvas>. Those are legitimate exceptions. The rule is
// narrower and mechanical: any such usage must carry a nearby
// `ionic-exception: <reason>` comment (a `//` line comment or a `{/* */}`
// JSX comment, either works) so the choice reads as deliberate, not
// accidental — grep for `ionic-exception` in web/src to see the current,
// reviewed list.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const srcRoot = path.join(repoRoot, 'web', 'src')

// How many lines above a flagged line to search for the marker comment —
// generous enough for a short explanatory comment block, not so generous
// that an exception 30 lines up in an unrelated function would count.
const MARKER_WINDOW = 8
const MARKER = 'ionic-exception:'

// [label, regex] — regex matched per-line against the raw file text. The
// "onClick on a plain element" case isn't here — it needs its own small
// multi-line scan (findOnClickDivs below) since the onClick attribute is
// usually a few lines below the tag's opening `<div`, not on the same line.
const PATTERNS = [
  ['a raw <button> (use IonButton)', /<button\b/],
  ['a raw <select> (use IonSelect)', /<select\b/],
  ['a raw checkbox/radio input (use IonCheckbox/IonRadio)', /type=["'](checkbox|radio)["']/],
  ['a raw file input (Ionic has no file picker — this one is a legitimate, common exception)', /type=["']file["']/],
  ['a raw <canvas> or canvas element creation (Ionic has no canvas/crop/chart component)', /<canvas\b|createElement\(['"]canvas['"]\)/],
]

function listTsxFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...listTsxFiles(full))
    } else if (/\.tsx?$/.test(entry) && !/\.(test|stories)\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

// The "onClick on a plain element" pattern needs its own small state
// machine (not just a per-line regex) since the onClick attribute is
// usually a few lines below the opening tag, not on the same line — check
// whether onClick= appears before the tag's own closing `>`.
function findOnClickDivs(lines) {
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    const m = /<(div|span|p|section|li|a)\b/.exec(lines[i])
    if (!m) continue
    const snippet = lines.slice(i, i + 15).join('\n')
    const closeIdx = snippet.indexOf('>')
    if (closeIdx === -1) continue
    if (snippet.slice(0, closeIdx).includes('onClick=')) {
      hits.push(i)
    }
  }
  return hits
}

function hasNearbyMarker(lines, lineIndex) {
  const start = Math.max(0, lineIndex - MARKER_WINDOW)
  return lines.slice(start, lineIndex + 1).some((l) => l.includes(MARKER))
}

let failed = false
let exceptionCount = 0

for (const file of listTsxFiles(srcRoot)) {
  const relative = path.relative(repoRoot, file)
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')

  for (const i of findOnClickDivs(lines)) {
    if (hasNearbyMarker(lines, i)) {
      exceptionCount++
    } else {
      failed = true
      console.error(`✗ ${relative}:${i + 1}: hand-rolled clickable element (onClick on a plain div/span/p/section/li/a) with no nearby "${MARKER}" comment`)
    }
  }

  for (const [label, regex] of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        if (hasNearbyMarker(lines, i)) {
          exceptionCount++
        } else {
          failed = true
          console.error(`✗ ${relative}:${i + 1}: ${label}, with no nearby "${MARKER}" comment`)
        }
      }
    }
  }
}

if (failed) {
  console.error('')
  console.error(`Add a comment containing "${MARKER} <reason>" within ${MARKER_WINDOW} lines above the flagged code,`)
  console.error('or replace it with the real Ionic component it should have used. See this script\'s own header comment.')
  process.exit(1)
} else {
  console.log(`✓ Ionic coverage check passed (${exceptionCount} explicitly marked exception${exceptionCount === 1 ? '' : 's'})`)
}
