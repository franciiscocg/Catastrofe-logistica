import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// __dirname apunta a TEST/geolocalizacion-tiempo-real/
// FRONTEND apunta a frontend/ (donde están node_modules y src)
const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(__dirname, '../../frontend')
const TEST_DIR  = __dirname.replace(/\\/g, '/')

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [resolve(FRONTEND, '..')] },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: [`${TEST_DIR}/frontend/**/*.test.{ts,tsx}`],
    setupFiles: [resolve(FRONTEND, 'vitest.feature-incidencias-vias.setup.ts')],
    // jsdom 27.x usa parse5 7.x y @asamuzakjp/css-color, ambos ESM-only.
    // --experimental-require-module (Node ≥ 22.12) permite require() de módulos
    // ESM síncronos sin necesidad de polyfills adicionales.
    pool: 'threads',
    poolOptions: {
      threads: {
        execArgv: ['--experimental-require-module'],
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(FRONTEND, 'src'),
      '@testing-library/react':     resolve(FRONTEND, 'node_modules/@testing-library/react'),
      '@testing-library/user-event': resolve(FRONTEND, 'node_modules/@testing-library/user-event'),
      '@testing-library/jest-dom':  resolve(FRONTEND, 'node_modules/@testing-library/jest-dom'),
      'react-router-dom':           resolve(FRONTEND, 'node_modules/react-router-dom'),
    },
  },
})
