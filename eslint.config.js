import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Les fichiers shadcn/ui et providers exportent volontairement des helpers avec leurs composants.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['api/lib/**/*.ts'],
    rules: {
      // Adaptateurs HTTP générés par le socle backend ; ils restent sous responsabilité de l'infrastructure.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
