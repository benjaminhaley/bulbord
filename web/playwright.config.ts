import { defineConfig, devices } from '@playwright/test'

// Campy targets one viewport class: vertical phone (see CLAUDE.md's Platform
// strategy) — Pixel 7 stands in for that here rather than any desktop profile.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
      },
})
