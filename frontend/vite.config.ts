import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
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
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
