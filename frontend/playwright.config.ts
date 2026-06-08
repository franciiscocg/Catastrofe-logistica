import { defineConfig, devices } from '@playwright/test'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Config unificada: corre los E2E de TODAS las features (TEST/<feature>/e2e/*.spec.ts).
// Requiere la app levantada en localhost:5173 (y el backend). No corre en el CI
// de unitarios; se lanza manualmente o en un job aparte que levante el stack.
const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_ROOT = resolve(__dirname, '..', 'TEST')

export default defineConfig({
  testDir: TEST_ROOT,
  testMatch: '**/e2e/**/*.spec.ts',
  fullyParallel: false,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
