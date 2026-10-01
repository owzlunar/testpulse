import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from 'eslint-config-prettier'

// Correctness rules only; formatting belongs to Prettier (`npm run format`)
export default defineConfigWithVueTs(
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    rules: {
      // `_name` marks a value that is destructured away on purpose
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      // views are grouped by folder and named Index.vue (see CLAUDE.md)
      'vue/multi-word-component-names': 'off',
    },
  },
  skipFormatting,
)
