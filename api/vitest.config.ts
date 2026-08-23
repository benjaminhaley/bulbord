import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Vitest's own default exclude list doesn't cover dist/ — running `npm
    // run build` locally (routine before a Railway deploy, see CLAUDE.md's
    // Hosting section) leaves compiled *.test.js files sitting next to the
    // real src/*.test.ts ones. Vitest picks up both, and the compiled copy
    // fails for reasons that have nothing to do with the actual code (e.g.
    // tsc never copies a .test.ts's non-.ts fixture files into dist/, so a
    // fixture-reading test 404s there even though the real src/ test is
    // fine) — found while verifying feedback #120's camp-reminders build.
    exclude: ['dist/**', 'node_modules/**'],
  },
})
