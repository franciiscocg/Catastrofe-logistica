import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const TEST_DIR = resolve(__dirname, '../TEST/feature-registro-usuarios').replace(/\\/g, '/')

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [`${TEST_DIR}/backend/**/*.test.ts`],
  },
  resolve: {
    alias: {
      fastify: resolve(__dirname, 'node_modules/fastify/fastify.js'),
      bcryptjs: resolve(__dirname, 'node_modules/bcryptjs/index.js'),
    },
    extensions: ['.ts', '.js'],
  },
})
