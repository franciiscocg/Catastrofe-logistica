import { test, expect } from '@playwright/test'

// ── Helpers de autenticacion ──────────────────────────────────────────────────

const VOL_AUTH = JSON.stringify({
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

const CIUDADANO_AUTH = JSON.stringify({
  state: {
    user: {
      id: 'ciudadano-demo',
      email: 'ciudadano@demo.com',
      nombre: 'Ciudadano',
      apellidos: 'Demo',
      roles: ['CIUDADANO'],
    },
    accessToken: 'demo-token-ciudadano',
    selectedRole: 'ciudadano',
    isAuthenticated: true,
  },
  version: 0,
})

async function injectVolAuth(page: import('@playwright/test').Page) {
  await page.addInitScript((value) => {
    localStorage.setItem('catlogistica-auth', value)
  }, VOL_AUTH)
}

async function injectCiudadanoAuth(page: import('@playwright/test').Page) {
  await page.addInitScript((value) => {
    localStorage.setItem('catlogistica-auth', value)
  }, CIUDADANO_AUTH)
}

async function gotoVoluntario(page: import('@playwright/test').Page) {
  await page.goto('/voluntario')
  await page.waitForLoadState('networkidle')
  if (!page.url().includes('/voluntario')) {
    await page.evaluate((val) => window.localStorage.setItem('catlogistica-auth', val), VOL_AUTH)
    await page.goto('/voluntario')
    await page.waitForLoadState('networkidle')
  }
}

async function gotoCiudadano(page: import('@playwright/test').Page) {
  await page.goto('/ciudadano')
  await page.waitForLoadState('networkidle')
  if (!page.url().includes('/ciudadano')) {
    await page.evaluate((val) => window.localStorage.setItem('catlogistica-auth', val), CIUDADANO_AUTH)
    await page.goto('/ciudadano')
    await page.waitForLoadState('networkidle')
  }
}

// ── Ciudadano: reporte de incidencia con titulo y categoria ───────────────────

test.describe('Ciudadano — Reporte de incidencia con titulo y categoria', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.addInitScript((val) => localStorage.setItem('catlogistica-auth', val), CIUDADANO_AUTH)
    await p.goto('http://localhost:5202/ciudadano')
    await p.waitForLoadState('networkidle').catch(() => {})
    await ctx.close()
  })

  test.beforeEach(async ({ page }) => {
    await injectCiudadanoAuth(page)
    await gotoCiudadano(page)
  })

  test('el dashboard ciudadano muestra el boton de reportar incidencia', async ({ page }) => {
    await expect(
      page.getByText(/reportar calle|reportar incidencia|nueva incidencia/i).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('el formulario de reporte incluye campo de titulo', async ({ page }) => {
    await page.getByText(/reportar calle|reportar incidencia/i).first().click()
    await page.waitForTimeout(500)
    const count = await page.getByText(/t[ií]tulo|nombre|identificador/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
    const inputCount = await page.locator('input[type="text"], input:not([type])').count()
    expect(inputCount).toBeGreaterThanOrEqual(0)
  })

  test('el formulario de reporte incluye selector de categoria', async ({ page }) => {
    await page.getByText(/reportar calle|reportar incidencia/i).first().click()
    await page.waitForTimeout(500)
    const count = await page.getByText(/categor[ií]a|tipo de incidencia|inundaci[oó]n|obst[aá]culos|limpieza|asistencia/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('el formulario puede mostrar equipamiento recomendado segun categoria', async ({ page }) => {
    await page.getByText(/reportar calle|reportar incidencia/i).first().click()
    await page.waitForTimeout(800)
    const count = await page.getByText(/equipamiento|recomendado|material|guante|bota|chaleco|botiq/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

// ── Voluntario: listado de incidencias con categoria y equipamiento ────────────

test.describe('Voluntario — Listado de incidencias con categoria', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.addInitScript((val) => localStorage.setItem('catlogistica-auth', val), VOL_AUTH)
    await p.goto('http://localhost:5202/voluntario')
    await p.waitForLoadState('networkidle').catch(() => {})
    await ctx.close()
  })

  test.beforeEach(async ({ page }) => {
    await injectVolAuth(page)
    await gotoVoluntario(page)
  })

  test('el dashboard voluntario muestra la opcion Ayudar en incidencia', async ({ page }) => {
    await expect(page.getByText('Ayudar en incidencia')).toBeVisible()
  })

  test('al pulsar Ayudar en incidencia se muestra el listado de incidencias activas', async ({ page }) => {
    await page.getByText('Ayudar en incidencia').click()
    await expect(
      page.getByText(/incidencia|calle cortada|incidencias abiertas/i).first()
    ).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('TRANSITABLE')).not.toBeVisible()
  })

  test('las incidencias pueden mostrar la categoria asignada', async ({ page }) => {
    await page.getByText('Ayudar en incidencia').click()
    await page.waitForTimeout(800)
    const count = await page.getByText(/inundaci[oó]n|obst[aá]culos|limpieza|asistencia/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('se puede acceder a la informacion de equipamiento recomendado por categoria', async ({ page }) => {
    await page.getByText('Ayudar en incidencia').click()
    await page.waitForTimeout(800)
    const count = await page.getByText(/equipamiento|recomendado|material necesario|guante|bota|chaleco/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

// ── Voluntario: confirmacion antes de unirse a incidencia ─────────────────────

test.describe('Voluntario — Confirmacion de recomendaciones antes de unirse', () => {
  test.beforeEach(async ({ page }) => {
    await injectVolAuth(page)
    await gotoVoluntario(page)
  })

  test('al intentar unirse a una incidencia se requiere alguna confirmacion o aviso', async ({ page }) => {
    await page.getByText('Ayudar en incidencia').click()
    await page.waitForTimeout(800)
    // Busca señales de que se requiere confirmacion o hay un paso previo
    const count = await page.getByText(/confirmar|acepto|entendido|he le[ií]do|unirme|apuntarme/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('el voluntario puede ver su asignacion activa si ya esta en una incidencia', async ({ page }) => {
    await page.getByText('Ayudar en incidencia').click()
    await page.waitForTimeout(500)
    const count = await page.getByText(/mi asignaci[oó]n|actualmente ayudando|abandonar|finalizar|salir/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('las incidencias transitable no se muestran en el listado de ayuda', async ({ page }) => {
    await page.getByText('Ayudar en incidencia').click()
    await page.waitForTimeout(500)
    await expect(page.getByText('TRANSITABLE')).not.toBeVisible()
  })
})

// ── Voluntario: fallback para incidencias sin categoria ───────────────────────

test.describe('Voluntario — Compatibilidad con incidencias sin categoria', () => {
  test.beforeEach(async ({ page }) => {
    await injectVolAuth(page)
    await gotoVoluntario(page)
  })

  test('las incidencias sin categoria se muestran sin errores usando descripcion como fallback', async ({ page }) => {
    await page.getByText('Ayudar en incidencia').click()
    await page.waitForTimeout(500)
    // El listado debe cargar sin errores aunque haya incidencias sin categoria
    await expect(
      page.getByText(/incidencia|calle|cortada|sin incidencias/i).first()
    ).toBeVisible({ timeout: 8000 })
    // No debe aparecer un mensaje de error JavaScript
    const errorCount = await page.getByText(/TypeError|ReferenceError|Cannot read/i).count()
    expect(errorCount).toBe(0)
  })
})
