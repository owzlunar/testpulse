import { readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

// Which API each module uses (src/api/index.ts), decided at build time:
//   VITE_API_MODE=rest|mock  rest: the backend (npm run dev, production builds); mock: everything on the
//                            mock (npm run dev:mock, unit tests, e2e/). Unset: rest in a production build.
//   VITE_API_REST=a,b        in rest mode, only these modules are on (the others' pages, menus and
//                            widgets are hidden); unset: every module with a file in src/api/rest
// Each choice becomes a constant (__API_MOCK_PROJECT__, __API_ON_PROJECT__ …) so unused code is dropped.
const modulesIn = (dir: string) =>
  readdirSync(fileURLToPath(new URL(dir, import.meta.url)))
    .filter((f) => f.endsWith('.ts') && !['index.ts', 'http.ts'].includes(f))
    .map((f) => f.slice(0, -3))

function apiDefines(env: Record<string, string>, mode: string): Record<string, string> {
  // a production build talks to the backend unless told otherwise (never a mock by accident)
  const apiMode = env.VITE_API_MODE || (mode === 'production' ? 'rest' : 'mock')
  if (!['rest', 'mock'].includes(apiMode)) throw new Error(`VITE_API_MODE must be rest or mock (got "${apiMode}")`)
  const allMock = apiMode === 'mock'
  const available = modulesIn('./src/api/rest')
  const allowed = env.VITE_API_REST
    ? env.VITE_API_REST.split(',')
        .map((m) => m.trim())
        .filter(Boolean)
    : available
  const unknown = allowed.filter((m) => !available.includes(m))
  if (!allMock && unknown.length) throw new Error(`VITE_API_REST: no src/api/rest module for ${unknown.join(', ')}`)
  const constant = (prefix: string, m: string) => `__API_${prefix}_${m.toUpperCase().replace(/-/g, '_')}__`
  const defines: Record<string, string> = {}
  let anyMock = false
  for (const m of modulesIn('./src/api/contract')) {
    const rest = !allMock && allowed.includes(m)
    anyMock ||= !rest
    // mock: the implementation behind the module; on: its pages and widgets are shown
    defines[constant('MOCK', m)] = JSON.stringify(!rest)
    defines[constant('ON', m)] = JSON.stringify(allMock || rest)
  }
  defines.__API_ANY_MOCK__ = JSON.stringify(anyMock)
  return defines
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
