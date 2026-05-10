// Ejecutar desde: TEST/issue-18-crear-puesto/
// Comando: npx vitest run --config vitest.frontend.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEST_DIR = resolve(__dirname).replace(/\\/g, '/')
const FRONTEND_DIR = resolve(TEST_DIR, '../../frontend').replace(/\\/g, '/')

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [resolve(TEST_DIR, '../..')] },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: [`${TEST_DIR}/frontend/**/*.test.{ts,tsx}`],
    setupFiles: [`${TEST_DIR}/setup.frontend.ts`],
  },
  resolve: {
    alias: {
      '@': `${FRONTEND_DIR}/src`,
      '@testing-library/react': `${FRONTEND_DIR}/node_modules/@testing-library/react`,
      '@testing-library/user-event': `${FRONTEND_DIR}/node_modules/@testing-library/user-event`,
      '@testing-library/jest-dom': `${FRONTEND_DIR}/node_modules/@testing-library/jest-dom`,
      '@tanstack/react-query': `${FRONTEND_DIR}/node_modules/@tanstack/react-query`,
      'react-router-dom': `${FRONTEND_DIR}/node_modules/react-router-dom`,
      react: `${FRONTEND_DIR}/node_modules/react`,
      'react-dom': `${FRONTEND_DIR}/node_modules/react-dom`,
    },
  },
})
