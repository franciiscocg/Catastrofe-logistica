import typescriptPlugin from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', '*.tsbuildinfo'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...typescriptPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
      }],
      ...reactHooks.configs.recommended.rules,
      // Las pantallas operativas contienen efectos dirigidos por refs y eventos
      // en tiempo real; rules-of-hooks sigue activo y sus dependencias se validan
      // con pruebas funcionales para evitar recrear navegaciones en cada render.
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]
