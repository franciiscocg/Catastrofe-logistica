// Ejecutar desde: TEST/ciudadano-menu-acciones/
// Comando: npx vitest run --config vitest.frontend.config.ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const TEST_DIR = resolve(__dirname).replace(/\\/g, '/')

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [`${TEST_DIR}/frontend/**/*.test.ts`],
  },
  resolve: {
    alias: {
      '@': resolve(TEST_DIR, '../../frontend/src'),
    },
    extensions: ['.ts', '.js'],
  },
})
