// Ejecutar desde: frontend/
// Comando: npx vitest run --config ../TEST/feature-incidencias-vias/vitest.frontend.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const TEST_DIR = resolve(__dirname).replace(/\\/g, '/')
const FRONTEND = resolve(__dirname, '../../frontend')

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      `${TEST_DIR}/frontend/**/*.test.ts`,
      `${TEST_DIR}/frontend/**/*.test.tsx`,
    ],
    setupFiles: [`${TEST_DIR}/setup.frontend.ts`],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'src/features/auth/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(FRONTEND, 'src'),
      '@tanstack/react-query': resolve(FRONTEND, 'node_modules/@tanstack/react-query'),
      '@testing-library/jest-dom': resolve(FRONTEND, 'node_modules/@testing-library/jest-dom'),
      '@testing-library/react': resolve(FRONTEND, 'node_modules/@testing-library/react'),
      'react-router-dom': resolve(FRONTEND, 'node_modules/react-router-dom'),
      'react-dom': resolve(FRONTEND, 'node_modules/react-dom'),
      react: resolve(FRONTEND, 'node_modules/react'),
    },
  },
})
