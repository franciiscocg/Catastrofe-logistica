import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_DIR = resolve(__dirname, '../TEST/feature-registro-usuarios').replace(/\\/g, '/')

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [resolve(__dirname, '..')] },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: [`${TEST_DIR}/frontend/**/*.test.{ts,tsx}`],
    setupFiles: [resolve(__dirname, 'vitest.feature-incidencias-vias.setup.ts')],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@testing-library/react': resolve(__dirname, 'node_modules/@testing-library/react'),
      '@testing-library/user-event': resolve(__dirname, 'node_modules/@testing-library/user-event'),
      '@testing-library/jest-dom': resolve(__dirname, 'node_modules/@testing-library/jest-dom'),
      '@tanstack/react-query': resolve(__dirname, 'node_modules/@tanstack/react-query'),
      'react-router-dom': resolve(__dirname, 'node_modules/react-router-dom'),
    },
  },
})
