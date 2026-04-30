// Ejecutar desde: backend/
// Comando: npx vitest run --config ../TEST/feature-incidencias-vias/vitest.backend.config.ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const TEST_DIR = resolve(__dirname)

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [`${TEST_DIR}/backend/**/*.test.ts`],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/modules/incidencias/**'],
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
})
