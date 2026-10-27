#!/usr/bin/env node
// Keeps labs independent experiments (see labs/README.md): a lab shares as
// little as possible with Bulbord, and Bulbord knows nothing about a lab
// beyond its one registration line. Run in CI and by the pre-push hook.
//
// API (api/src):
//   - a lab (api/src/labs/<name>/) imports only its own folder, npm packages,
//     and `import type` from labs/sandbox.ts (the contract);
//   - labs/sandbox.ts imports only labs/ and npm packages;
//   - outside labs/, only app.ts imports from labs/, and only sandbox.ts.
// Web:
//   - web/src never imports from web/public;
//   - a lab page (web/public/labs/<name>/) loads scripts/styles only from its
//     own folder or full https:// URLs. Plain navigation links (<a href>) to
//     the app are fine.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const apiSrc = path.join(root, 'api/src')
const labsApi = path.join(apiSrc, 'labs')
const sandbox = path.join(labsApi, 'sandbox.ts')
const webSrc = path.join(root, 'web/src')
const webPublic = path.join(root, 'web/public')
const labsWeb = path.join(webPublic, 'labs')

const problems = []
const rel = (p) => path.relative(root, p)

function walk(dir, exts) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p, exts)
    return exts.some((x) => e.name.endsWith(x)) ? [p] : []
  })
}

// Every static import/export-from/dynamic import, with whether it's type-only.
function imports(file) {
  const src = fs.readFileSync(file, 'utf8')
  const found = []
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g
  for (const m of src.matchAll(re)) {
    found.push({ spec: m[3] ?? m[4] ?? m[5], typeOnly: Boolean(m[2]) })
  }
  return found
}

function resolve(file, spec) {
  if (!spec.startsWith('.')) return null // npm package or node: builtin
  return path.resolve(path.dirname(file), spec).replace(/\.js$/, '.ts')
}

const inside = (p, dir) => p === dir || p.startsWith(dir + path.sep)

// --- API ---
for (const file of walk(apiSrc, ['.ts'])) {
  for (const { spec, typeOnly } of imports(file)) {
    const target = resolve(file, spec)
    if (!target) continue
    if (file === sandbox || (inside(file, labsApi) && path.dirname(file) === labsApi)) {
      // sandbox.ts and its test: labs/ only.
      if (!inside(target, labsApi)) problems.push(`${rel(file)} imports ${spec} — labs/sandbox.ts may import only from labs/`)
    } else if (inside(file, labsApi)) {
      const labDir = path.join(labsApi, path.relative(labsApi, file).split(path.sep)[0])
      if (inside(target, labDir)) continue
      if (target === sandbox && typeOnly) continue
      problems.push(`${rel(file)} imports ${spec} — a lab may import only its own folder, npm packages, and \`import type\` from ../sandbox.js`)
    } else if (inside(target, labsApi)) {
      if (file === path.join(apiSrc, 'app.ts') && target === sandbox) continue
      problems.push(`${rel(file)} imports ${spec} — only app.ts may import from labs/, and only labs/sandbox.js`)
    }
  }
}

// --- Web ---
for (const file of walk(webSrc, ['.ts', '.tsx'])) {
  for (const { spec } of imports(file)) {
    const target = resolve(file, spec)
    if (target && inside(target, webPublic)) problems.push(`${rel(file)} imports ${spec} — web/src must not import from web/public`)
  }
}

for (const labDir of fs.existsSync(labsWeb) ? fs.readdirSync(labsWeb).map((n) => path.join(labsWeb, n)) : []) {
  if (!fs.statSync(labDir).isDirectory()) continue
  const urlPrefix = '/' + path.relative(webPublic, labDir).split(path.sep).join('/') + '/'
  for (const file of walk(labDir, ['.html', '.js', '.css'])) {
    const src = fs.readFileSync(file, 'utf8')
    const loads = [
      ...src.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi),
      ...src.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi),
      ...src.matchAll(/<(?:img|iframe|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi),
      ...src.matchAll(/\bimport\s*(?:[^'"]*from\s*)?\(?\s*["']([^"']+)["']/g),
      ...src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g),
    ].map((m) => m[1])
    for (const url of loads) {
      if (/^(https:|data:|#)/.test(url)) continue
      const resolved = url.startsWith('/')
        ? url
        : '/' + path.relative(webPublic, path.resolve(path.dirname(file), url)).split(path.sep).join('/')
      if (!resolved.startsWith(urlPrefix)) problems.push(`${rel(file)} loads ${url} — a lab page may load files only from its own folder (${urlPrefix})`)
    }
  }
}

if (problems.length) {
  console.error('Lab isolation check failed (see labs/README.md):\n' + problems.map((p) => '  - ' + p).join('\n'))
  process.exit(1)
}
console.log('Lab isolation check passed.')
