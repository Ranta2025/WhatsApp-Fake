import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const allowExportNames = ['useAuth', 'useDashboard', 'useMessaging', 'useGroupMessaging', 'useStatus']

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Los contextos exportan su hook junto al Provider (patrón habitual).
      'react-refresh/only-export-components': ['error', { allowExportNames }],
    },
  },
  {
    // vite.config.ts se ejecuta en Node
    files: ['vite.config.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    // Único JS restante: la configuración raíz (se ejecuta en Node)
    files: ['eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },
  {
    // Scripts de utilidad (Node), sin reglas recomendadas como antes
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
])
