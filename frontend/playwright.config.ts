import { defineConfig, devices } from '@playwright/test'

// End-to-end tests in a real browser against the dev server (mock API, LocalStorage).
// Every test gets a fresh browser context, so it starts from the seed data.
const PORT = 5175

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: 3,
  timeout: 60_000,
  // the dev server compiles each page on its first visit; with parallel workers that can take a while
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // the e2e suite runs on the mock API (no backend needed)
    command: `npx vite --mode mock --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
