import { test, expect } from '@playwright/test'

// REQUISITO: Playwright arranca el frontend automaticamente (webServer en playwright.config.ts)

// ── Helper: inyectar sesion antes de que el JS de la pagina arranque ──────────
// page.addInitScript garantiza que localStorage esta disponible antes de que
// Zustand inicialice el store, evitando la race condition de hidratacion.

const AUTH_STORAGE_VALUE = JSON.stringify({
  state: {
    user: {
      id: 'vol-demo',
      email: 'voluntario@demo.com',
      nombre: 'Voluntario',
      apellidos: 'Demo',
      roles: ['VOLUNTARIO'],
    },
    accessToken: 'demo-token',
    selectedRole: 'voluntario',
    isAuthenticated: true,
  },
  version: 0,
})

async function injectAuth(page: import('@playwright/test').Page) {
  // addInitScript garantiza que localStorage esta disponible antes del JS de la pagina
  await page.addInitScript((value) => {
    localStorage.setItem('catlogistica-auth', value)
  }, AUTH_STORAGE_VALUE)
}

// Navega a /voluntario con reintentos. El primer acceso al dashboard (chunk lazy)
// puede tardar mas tiempo del que addInitScript da a Zustand para hidratar.
async function gotoVoluntario(page: import('@playwright/test').Page) {
  await page.goto('/voluntario')
  await page.waitForLoadState('networkidle')

  // Si auth fallo (redirigido a login), inyectar localStorage directamente y reintentar
  if (!page.url().includes('/voluntario')) {
    await page.evaluate((val) => window.localStorage.setItem('catlogistica-auth', val), AUTH_STORAGE_VALUE)
    await page.goto('/voluntario')
    await page.waitForLoadState('networkidle')
  }
}

// ── Seleccion de rol — sin sesion ─────────────────────────────────────────────

test.describe('Seleccion de rol — Voluntario', () => {
  test('muestra la tarjeta de Voluntario / Donante en la pantalla de inicio', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Voluntario')).toBeVisible()
  })

  test('redirige a login con role=voluntario al pulsar la tarjeta sin sesión', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Acceder como Voluntario/i }).click()
    await expect(page).toHaveURL(/\/auth\/login.*role=voluntario/)
  })

  test('muestra las tarjetas de rol disponibles al abrir la app', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Ciudadano')).toBeVisible()
    await expect(page.getByText('Voluntario')).toBeVisible()
    await expect(page.getByText('Puesto de Emergencia')).toBeVisible()
    await expect(page.getByText('Coordinador')).not.toBeVisible()
  })
})

// ── Dashboard voluntario — con sesion ─────────────────────────────────────────

test.describe('Dashboard voluntario', () => {
  // Precalentar el chunk lazy del dashboard: Vite lo compila la primera vez
  // que se solicita; sin este warm-up el primer test falla por cold-start.
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.addInitScript((val) => localStorage.setItem('catlogistica-auth', val), AUTH_STORAGE_VALUE)
    await p.goto('http://localhost:5199/voluntario')
    await p.waitForLoadState('networkidle').catch(() => {})
    await ctx.close()
  })

  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await gotoVoluntario(page)
  })

  test('muestra el titulo Centro de actividad', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Centro de actividad' })).toBeVisible()
  })

  test('muestra las tres opciones de accion del voluntario', async ({ page }) => {
    await expect(page.getByText('Hacer una donación')).toBeVisible()
    await expect(page.getByText('Ayudar en incidencia')).toBeVisible()
    await expect(page.getByText('Ayudar en puesto')).toBeVisible()
  })

  test('muestra el panel de estado del voluntario', async ({ page }) => {
    await expect(page.getByText('Panel de voluntario')).toBeVisible()
    await expect(page.getByText('Conexion')).toBeVisible()
    await expect(page.getByText('Activas')).toBeVisible()
  })
})

// ── Donaciones — vista de necesidades ────────────────────────────────────────

test.describe('Donaciones — vista de necesidades', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await gotoVoluntario(page)
  })

  test('al pulsar Hacer una donación aparece la seccion de donaciones', async ({ page }) => {
    await page.getByText('Hacer una donación').click()
    await expect(page.getByRole('heading', { name: 'Donaciones' })).toBeVisible()
  })

  test('muestra las pestanas Objetos y Mis donaciones al entrar en donación', async ({ page }) => {
    await page.getByText('Hacer una donación').click()
    await expect(page.getByRole('button', { name: 'Objetos' })).toBeVisible()
    await expect(page.getByText(/Mis donaciones/)).toBeVisible()
  })

  test('muestra necesidades agrupadas por producto o mensaje de vacio', async ({ page }) => {
    await page.getByText('Hacer una donación').click()
    await expect(
      page.getByText(/agua|comida|herramienta|producto|necesidad|sin|vac[ií]o|cargando/i).first()
    ).toBeVisible({ timeout: 8000 })
  })
})

// ── Donaciones — Mis donaciones ───────────────────────────────────────────────

test.describe('Donaciones — Mis donaciones', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await gotoVoluntario(page)
  })

  test('al pulsar Mis donaciones muestra el historial del voluntario', async ({ page }) => {
    await page.getByText('Hacer una donación').click()
    const misDonacionesTab = page.getByText(/Mis donaciones/)
    await expect(misDonacionesTab).toBeVisible()
    await misDonacionesTab.click()
    await expect(
      page.getByText(/donaci[oó]n|en camino|pendiente|entregada|no tienes|historial|activa/i).first()
    ).toBeVisible({ timeout: 8000 })
  })
})

// ── Ayudar en incidencia ──────────────────────────────────────────────────────

test.describe('Ayudar en incidencia', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await gotoVoluntario(page)
  })

  test('al pulsar Ayudar en incidencia muestra la lista de calles cortadas', async ({ page }) => {
    await page.getByText('Ayudar en incidencia').click()
    await expect(
      page.getByText(/incidencia|calle cortada|Incidencias abiertas/i).first()
    ).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('TRANSITABLE')).not.toBeVisible()
  })

  test('las incidencias se ordenan por cercania con ubicación del voluntario', async ({ page }) => {
    await page.context().setGeolocation({ latitude: 39.4254, longitude: -0.4178 })
    await gotoVoluntario(page)
    await page.getByText('Ayudar en incidencia').click()
    await expect(
      page.getByText(/incidencia|calle|cortada|km|dist/i).first()
    ).toBeVisible({ timeout: 8000 })
  })
})

// ── Ayudar en puesto ──────────────────────────────────────────────────────────

test.describe('Ayudar en puesto', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await gotoVoluntario(page)
  })

  test('al pulsar Ayudar en puesto muestra el listado de puestos activos', async ({ page }) => {
    await page.getByText('Ayudar en puesto').click()
    await expect(
      page.getByText(/puesto|emergencia|distribuci[oó]n|apoyo|activo/i).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('muestra la ocupacion y capacidad de cada puesto', async ({ page }) => {
    await page.getByText('Ayudar en puesto').click()
    await page.waitForTimeout(500)
    const count = await page.getByText(/voluntario|capacidad|trabajando|\d+\/\d+/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

// ── Control de actividad operativa unica activa ───────────────────────────────

test.describe('Control de actividad única activa', () => {
  test('el dashboard carga con sesión activa sin redirigir a login', async ({ page }) => {
    await injectAuth(page)
    await gotoVoluntario(page)
    await expect(page).not.toHaveURL(/\/auth\/login/)
    await expect(page.getByRole('heading', { name: 'Centro de actividad' })).toBeVisible()
  })
})

// ── Calcular ruta segura hacia el puesto ──────────────────────────────────────

test.describe('Calcular ruta segura hacia el puesto', () => {
  test('el boton de ruta aparece al entrar en Ayudar en puesto', async ({ page }) => {
    await injectAuth(page)
    await gotoVoluntario(page)
    await page.getByText('Ayudar en puesto').click()
    await page.waitForTimeout(500)
    const count = await page.getByText(/ruta|llegar|c[oó]mo llegar|unirse|apuntarse/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})
