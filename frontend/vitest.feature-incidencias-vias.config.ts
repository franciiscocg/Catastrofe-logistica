import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_DIR = resolve(__dirname, '../TEST/feature-incidencias-vias').replace(/\\/g, '/')

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Permite a Vite servir ficheros fuera de frontend/ (necesario para TEST/)
      allow: [resolve(__dirname, '..')],
    },
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
      // Aliases explícitos para test files fuera de frontend/
      // Vite resuelve paquetes desde la ubicación del fichero, no desde el root del proyecto
      '@testing-library/react': resolve(__dirname, 'node_modules/@testing-library/react'),
      '@testing-library/user-event': resolve(__dirname, 'node_modules/@testing-library/user-event'),
      '@testing-library/jest-dom': resolve(__dirname, 'node_modules/@testing-library/jest-dom'),
      'react-router-dom': resolve(__dirname, 'node_modules/react-router-dom'),
    },
  },
})
