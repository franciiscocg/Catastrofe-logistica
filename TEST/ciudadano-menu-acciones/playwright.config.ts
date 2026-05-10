import { defineConfig, devices } from '@playwright/test'

// Puerto dedicado para E2E — distinto del devServer habitual (5173)
// para evitar conflictos con otras suites que puedan estar corriendo.
const PORT = 5200

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 1,
  timeout: 30000,
  reporter: 'list',

  // Playwright arranca su propio servidor Vite en el puerto dedicado.
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    cwd: '../../frontend',
    timeout: 60000,
  },

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile',   use: { ...devices['Pixel 7'] } },
  ],
})
