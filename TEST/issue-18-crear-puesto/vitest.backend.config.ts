// Ejecutar desde: TEST/issue-18-crear-puesto/
// Comando: npx vitest run --config vitest.backend.config.ts
import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEST_DIR = resolve(__dirname).replace(/\\/g, '/')
const BACKEND_DIR = resolve(TEST_DIR, '../../backend').replace(/\\/g, '/')

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [`${TEST_DIR}/backend/**/*.test.ts`],
  },
  resolve: {
    alias: {
      // fastify y bcryptjs están en backend/node_modules, no en TEST/node_modules.
      // Sin estos aliases vitest no los encuentra y los mocks de vi.mock() no se aplican.
      fastify:  `${BACKEND_DIR}/node_modules/fastify/fastify.js`,
      bcryptjs: `${BACKEND_DIR}/node_modules/bcryptjs/index.js`,
    },
    extensions: ['.ts', '.js'],
  },
})
