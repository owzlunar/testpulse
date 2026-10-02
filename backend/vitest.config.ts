import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'dotenv'
import { defineConfig } from 'vitest/config'

// Tests run against a real MongoDB, so plugins, indexes and transactions are tested for real:
// - MONGODB_URI in backend/.env.test (a developer machine): that database, emptied before and after
//   each test; the files run one after another (they share it). Only this file is read: never
//   .env / .env.dev / .env.prod, nor a MONGODB_URI left in the shell, since the tests delete data.
// - otherwise (CI): an in-memory replica set started once, one database per test file, in parallel
const testMongoUri = existsSync('.env.test') ? parse(readFileSync('.env.test')).MONGODB_URI : undefined
// handed to the global setup, which runs in this process (test.env only reaches the test workers)
if (testMongoUri) process.env.TEST_MONGODB_URI = testMongoUri
else delete process.env.TEST_MONGODB_URI

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
