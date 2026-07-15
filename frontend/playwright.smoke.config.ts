import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // El flujo de capturas tiene su propio config (playwright.screenshot.config.ts)
  // y sobrescribe fotos-ui/, así que no debe correr dentro del smoke.
  testIgnore: 'screenshot-flow.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: 'list',
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'allow',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
