#!/usr/bin/env node
// Fails if a web-side formatting file and its api-side email-template
// counterpart have drifted apart — originally just web/src/events/format.ts
// vs. api/src/newsletter/format.ts (the pure event-formatting helpers
// shared between the app's event cards and the weekly newsletter — see the
// comment atop either file), joined by the same relationship for camps'
// format.ts once feedback #120's "day off camp" reminder email needed it
// too. There's no real shared package between web/ and api/ deploys (see
// CLAUDE.md), so these pairs are kept in sync by convention instead of by
// import — this script is what actually enforces the convention, run in CI
// on every push. Each pair's main file is expected to be 100% identical;
// its *.test.ts twin is expected identical except for the import line's
// `.js` extension, which api's NodeNext module resolution requires and
// web's bundler resolution doesn't use.

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

checkIdentical('format.ts', 'web/src/events/format.ts', 'api/src/newsletter/format.ts', {
  normalize: stripJsExtensionFromImports,
})
checkIdentical('format.test.ts', 'web/src/events/format.test.ts', 'api/src/newsletter/format.test.ts', {
  normalize: stripJsExtensionFromImports,
})
checkIdentical('theme.ts', 'web/src/events/theme.ts', 'api/src/newsletter/theme.ts')
checkIdentical('camps/format.ts', 'web/src/camps/format.ts', 'api/src/camps/format.ts', {
  normalize: stripJsExtensionFromImports,
})
checkIdentical('camps/format.test.ts', 'web/src/camps/format.test.ts', 'api/src/camps/format.test.ts', {
  normalize: stripJsExtensionFromImports,
})
checkIdentical('dayLabel.ts', 'web/src/dayLabel.ts', 'api/src/dayLabel.ts')
checkIdentical('dayLabel.test.ts', 'web/src/dayLabel.test.ts', 'api/src/dayLabel.test.ts', {
  normalize: stripJsExtensionFromImports,
})

if (failed) {
  process.exit(1)
}
