// Ejecutar desde: TEST/feature-funcionalidad-voluntario/
// Comando: npx vitest run --config vitest.backend.config.ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const TEST_DIR = resolve(__dirname).replace(/\\/g, '/')

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [`${TEST_DIR}/backend/**/*.test.ts`],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/modules/donaciones/**',
        'src/modules/incidencias/**',
        'src/modules/puestos/**',
      ],
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
})
