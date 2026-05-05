import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const TEST_DIR = resolve(__dirname, '../TEST/feature-puesto-emergencia').replace(/\\/g, '/')

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
