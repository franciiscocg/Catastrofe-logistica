// Ejecutar desde: backend/
// Comando: npx vitest run --config <ruta-absoluta-a-este-fichero>
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const TEST_DIR    = resolve(__dirname).replace(/\\/g, '/')
const BACKEND_DIR = resolve(__dirname, '../../backend')

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [`${TEST_DIR}/backend/**/*.test.ts`],
  },
  resolve: {
    alias: {
      fastify: resolve(BACKEND_DIR, 'node_modules/fastify/fastify.js'),
    },
    extensions: ['.ts', '.js'],
  },
})
