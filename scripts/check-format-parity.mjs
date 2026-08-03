#!/usr/bin/env node
// Fails if web/src/events/format.ts and api/src/newsletter/format.ts (the
// pure event-formatting helpers shared between the app's event cards and
// the weekly newsletter — see the comment atop either file) have drifted
// apart. There's no real shared package between web/ and api/ deploys (see
// CLAUDE.md), so these two files are kept in sync by convention instead of
// by import — this script is what actually enforces the convention, run in
// CI on every push. Both files are expected to be 100% identical; their
// *.test.ts twins are expected identical except for the import line's `.js`
// extension, which api's NodeNext module resolution requires and web's
// bundler resolution doesn't use.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function read(relativePath) {
  return readFileSync(new URL(relativePath, `file://${repoRoot}/`), 'utf8')
}

function stripJsExtensionFromImports(source) {
  return source.replace(/from '(\.[^']+)\.js'/g, "from '$1'")
}

let failed = false

function checkIdentical(label, webPath, apiPath, { normalize = (s) => s } = {}) {
  const webSource = normalize(read(webPath))
  const apiSource = normalize(read(apiPath))
  if (webSource !== apiSource) {
    failed = true
    console.error(`✗ ${label} has drifted apart: ${webPath} !== ${apiPath}`)
    console.error(`  Update whichever one didn't just change so they match again.`)
  } else {
    console.log(`✓ ${label} matches`)
  }
}

checkIdentical('format.ts', 'web/src/events/format.ts', 'api/src/newsletter/format.ts')
checkIdentical('format.test.ts', 'web/src/events/format.test.ts', 'api/src/newsletter/format.test.ts', {
  normalize: stripJsExtensionFromImports,
})
checkIdentical('theme.ts', 'web/src/events/theme.ts', 'api/src/newsletter/theme.ts')

if (failed) {
  process.exit(1)
}
