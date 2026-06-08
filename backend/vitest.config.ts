import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Config unificada: corre los tests unitarios de backend de TODAS las features.
// Los tests viven en TEST/<feature>/backend/ y mockean Prisma (no necesitan BD).
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
