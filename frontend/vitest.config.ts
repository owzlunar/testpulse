import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests for the mock API's server-side rules (src/services). happy-dom provides localStorage,
// the mock database; tests/setup.ts empties it before every test.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['tests/setup.ts'],
  },
})
