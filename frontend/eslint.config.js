import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      // Los contextos exportan su hook junto al Provider (patrón habitual).
      'react-refresh/only-export-components': ['error', { allowExportNames: ['useAuth', 'useDashboard', 'useMessaging', 'useGroupMessaging'] }],
    },
  },
  {
    // Archivos de configuración que se ejecutan en Node
    files: ['vite.config.js', 'scripts/**/*.{js,mjs}', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
])
