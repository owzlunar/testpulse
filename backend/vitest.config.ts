import { defineConfig } from 'vitest/config'

// Tests run against a real MongoDB (in-memory replica set started once, one database per test file),
// so plugins, indexes and transactions are tested for real, not mocked.
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup-env.ts'],
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
