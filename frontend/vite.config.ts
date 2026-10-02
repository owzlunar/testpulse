import { readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

// Which API each module uses (src/api/index.ts), decided at build time:
//   VITE_API_MODE=mock|real   (.env.development / .env.production: real; unset: real in a production
//                             build, mock otherwise, e.g. tests)
//   VITE_API_MOCK=a,b         modules kept on the mock in real mode
// A module without a real implementation (no file in src/api/real) always uses the mock. Each
// choice becomes a constant (__API_MOCK_TEST_CASE__ = true …) so unused code is dropped.
const modulesIn = (dir: string) =>
  readdirSync(fileURLToPath(new URL(dir, import.meta.url)))
    .filter((f) => f.endsWith('.ts') && !['index.ts', 'http.ts'].includes(f))
    .map((f) => f.slice(0, -3))

function apiDefines(env: Record<string, string>, mode: string): Record<string, string> {
  // a production build talks to the real backend unless told otherwise (never a mock by accident)
  const mockAll = (env.VITE_API_MODE || (mode === 'production' ? 'real' : 'mock')) !== 'real'
  const keepMock = (env.VITE_API_MOCK ?? '').split(',').map((m) => m.trim())
  const real = new Set(modulesIn('./src/api/real'))
  const useMock = Object.fromEntries(modulesIn('./src/api/contract').map((m) => [m, mockAll || keepMock.includes(m) || !real.has(m)]))
  return {
    ...Object.fromEntries(Object.entries(useMock).map(([m, v]) => [`__API_MOCK_${m.toUpperCase().replace(/-/g, '_')}__`, JSON.stringify(v)])),
    __API_ANY_MOCK__: JSON.stringify(Object.values(useMock).some(Boolean)),
  }
}

export default defineConfig(({ mode }) => ({
  define: apiDefines(loadEnv(mode, process.cwd(), 'VITE_'), mode),
  // relative asset URLs: the built app works under any public path (<base href> in index.html)
  base: './',
  plugins: [vue(), vuetify({ styles: { configFile: 'src/styles/settings.scss' } })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  css: {
    preprocessorOptions: {
      // Vuetify 3.5.9's own Sass (compiled because of styles.configFile) triggers
      // "mixed-decls" deprecation warnings. Our styles don't; silence only this one.
      // sass is pinned to ~1.77.8 in package.json so the CSS output doesn't change.
      sass: { api: 'modern', silenceDeprecations: ['mixed-decls'] },
      scss: { api: 'modern', silenceDeprecations: ['mixed-decls'] },
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    // the backend (npm run dev in backend/): same origin for the API, its refresh cookie and file URLs;
    // API_PROXY_TARGET points elsewhere (the real-backend e2e suite runs its own on :4100)
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:4000' },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
}))
