import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'dotenv'
import { defineConfig } from 'vitest/config'

// Tests run against a real MongoDB, so plugins, indexes and transactions are tested for real:
// - TEST_MONGODB_URI (environment, or backend/.env.test on a developer machine): that database,
//   emptied before and after each test; the files run one after another (they share it)
// - otherwise (CI): an in-memory replica set started once, one database per test file, in parallel
const local = existsSync('.env.test') ? parse(readFileSync('.env.test')) : {}
const testMongoUri = process.env.TEST_MONGODB_URI ?? local.TEST_MONGODB_URI
// the global setup runs in this process (test.env only reaches the test workers)
if (testMongoUri) process.env.TEST_MONGODB_URI = testMongoUri

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup-env.ts'],
    fileParallelism: !testMongoUri,
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // not measured: tests, generated contract, seeds, and wiring that needs real infrastructure
      // (process start / signals, the MongoDB connection string, the MinIO client, command-line tools)
      exclude: [
        'src/**/__tests__/**',
        'src/contract/**',
        'src/**/*.seed.ts',
        'src/index.ts',
        'src/cli/**',
        'src/core/server.ts',
        'src/core/config/db.ts',
        'src/core/storage/minio.adapter.ts',
      ],
      thresholds: { lines: 80, branches: 70 },
    },
  },
})
