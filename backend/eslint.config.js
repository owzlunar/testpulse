import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Besides the usual rules, ESLint enforces the module boundaries (IMPROVEMENTS 19.1 §5):
//   1. core never imports from modules
//   2. a module uses another module only through its index.ts
//   3. a controller never imports a repository or model (it goes through its service)

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'src/contract/types.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ regex: '^#modules/|/modules/', message: 'core must not depend on modules' }] }],
    },
  },
  {
    files: ['src/modules/**/*.ts'],
    // a module's own tests reach into it with relative paths
    ignores: ['src/modules/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // (patterns use regex: in gitignore-style groups a leading '#' is a comment)
            { regex: '^#modules/[^/]+/(?!index\\.js$)', message: "use the other module's public index.ts" },
            { regex: '^\\.\\./', message: "modules import core with '#core/...', other modules through '#modules/<name>/index.js'" },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/**/*.controller.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['./*.repository.js', './*.model.js'], message: 'controllers call the service, never the repository or model' },
            { regex: '^#modules/[^/]+/(?!index\\.js$)', message: "use the other module's public index.ts" },
          ],
        },
      ],
    },
  },
)
