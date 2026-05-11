// Ejecutar desde: backend/
// Comando: npx vitest run --config <ruta-absoluta-a-este-fichero>
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const TEST_DIR = resolve(__dirname).replace(/\\/g, '/')

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [`${TEST_DIR}/backend/**/*.test.ts`],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
})
