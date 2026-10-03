import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// End-to-end tests of the web app against the REAL backend (npm run test:e2e:real), local only:
// needs the MongoDB replica set and Mailpit (SMTP :1025, API :8025) running. The backend runs on
// :4100 against the test database of backend/.env.test (emptied and re-seeded first), the app on
// :5176 in real API mode, proxied to it.
const FRONTEND = 5176
const BACKEND = 4100

const envTest = '../backend/.env.test'
const testDb = existsSync(envTest) ? /^MONGODB_URI=(.+)$/m.exec(readFileSync(envTest, 'utf8'))?.[1]?.trim() : undefined
if (!testDb) throw new Error('backend/.env.test with MONGODB_URI (a test database) is needed for the real-backend e2e suite')

const backendEnv = {
  NODE_ENV: 'development',
  PORT: String(BACKEND),
  BASE_URL: `http://localhost:${FRONTEND}`,
  MONGODB_URI: testDb,
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_ROOT: mkdtempSync(join(tmpdir(), 'tp-e2e-files-')),
  MAIL_DRIVER: 'smtp',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  LOG_LEVEL: 'warn',
  RATE_LIMIT_AUTH: '10000',
  RATE_LIMIT_GLOBAL: '100000',
  // short access tokens (the shortest allowed) so the silent refresh happens within a test
  ACCESS_TOKEN_TTL_SEC: '60',
}

export default defineConfig({
  testDir: 'e2e-real',
  // one backend and one database for the whole run: tests run one after another
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: './e2e-real/global-setup.ts',
  use: {
    baseURL: `http://localhost:${FRONTEND}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'npx tsx --conditions=source scripts/e2e-reset.ts && npx tsx --conditions=source src/index.ts',
      cwd: '../backend',
      env: backendEnv,
      url: `http://localhost:${BACKEND}/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${FRONTEND} --strictPort`,
      env: { VITE_API_MODE: 'rest', API_PROXY_TARGET: `http://localhost:${BACKEND}` },
      url: `http://localhost:${FRONTEND}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
