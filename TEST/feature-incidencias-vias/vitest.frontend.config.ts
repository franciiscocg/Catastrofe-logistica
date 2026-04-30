// Ejecutar desde: frontend/
// Comando: npx vitest run --config ../TEST/feature-incidencias-vias/vitest.frontend.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const TEST_DIR = resolve(__dirname)

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: [`${TEST_DIR}/frontend/**/*.test.{ts,tsx}`],
    setupFiles: [`${TEST_DIR}/setup.frontend.ts`],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'src/features/auth/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../frontend/src'),
    },
  },
})
