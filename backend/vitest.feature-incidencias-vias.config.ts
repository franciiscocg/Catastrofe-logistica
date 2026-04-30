import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Normalizar a forward slashes para que el glob funcione en Windows
const TEST_DIR = resolve(__dirname, '../TEST/feature-incidencias-vias').replace(/\\/g, '/')

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
