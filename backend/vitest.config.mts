import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Config unificada: corre los tests unitarios de backend de TODAS las features.
// Los tests viven en TEST/<feature>/backend/ y mockean Prisma (no necesitan BD).
// Extensión .mts: Vite la carga como ESM y evita el aviso de deprecación
// "The CJS build of Vite's Node API is deprecated".
const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_ROOT = resolve(__dirname, '../TEST').replace(/\\/g, '/')

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [`${TEST_ROOT}/**/backend/**/*.test.ts`],
  },
  resolve: {
    alias: {
      // Algunas features importan `from 'fastify'` (bare). Sin este alias, vite
      // lo mal-resuelve a backend/fastify y falla con "Cannot find ./lib/symbols.js".
      fastify: resolve(__dirname, 'node_modules/fastify/fastify.js'),
    },
    extensions: ['.ts', '.js'],
  },
})
