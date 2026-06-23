import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Config dedicada al benchmark de enrutamiento (frontend/benchmark/).
// Entorno 'node' (no necesita DOM) y timeout amplio: ejecuta miles de calculos
// de ruta deterministas.
const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // El benchmark importa src/utils/routing.ts, que usa el alias '@' → ./src.
  // Sin esta resolución, la carga de '@/lib/db/publicSnapshots' falla.
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: [resolve(__dirname, 'benchmark/**/*.test.ts').replace(/\\/g, '/')],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
})
