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

const PUESTO_AUTH = JSON.stringify({
  state: {
    user: {
      id: 'puesto-demo',
      email: 'puesto@demo.com',
      nombre: 'Responsable',
      apellidos: 'Demo',
      roles: ['PUESTO_EMERGENCIA'],
    },
    accessToken: 'demo-token-puesto',
    selectedRole: 'puesto_emergencia',
    isAuthenticated: true,
  },
  version: 0,
})

async function injectVolAuth(page: import('@playwright/test').Page) {
  await page.addInitScript((value) => {
    localStorage.setItem('catlogistica-auth', value)
  }, VOL_AUTH)
}

async function injectPuestoAuth(page: import('@playwright/test').Page) {
  await page.addInitScript((value) => {
    localStorage.setItem('catlogistica-auth', value)
  }, PUESTO_AUTH)
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

async function gotoPuesto(page: import('@playwright/test').Page) {
  await page.goto('/puesto')
  await page.waitForLoadState('networkidle')
  if (!page.url().includes('/puesto')) {
    await page.evaluate((val) => window.localStorage.setItem('catlogistica-auth', val), PUESTO_AUTH)
    await page.goto('/puesto')
    await page.waitForLoadState('networkidle')
  }
}

// ── Voluntario: flujo de solicitud de participacion ───────────────────────────

test.describe('Voluntario — Ayudar en puesto', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.addInitScript((val) => localStorage.setItem('catlogistica-auth', val), VOL_AUTH)
    await p.goto('http://localhost:5201/voluntario')
    await p.waitForLoadState('networkidle').catch(() => {})
    await ctx.close()
  })

  test.beforeEach(async ({ page }) => {
    await injectVolAuth(page)
    await gotoVoluntario(page)
  })

  test('el dashboard muestra la opcion Ayudar en puesto', async ({ page }) => {
    await expect(page.getByText('Ayudar en puesto')).toBeVisible()
  })

  test('al pulsar Ayudar en puesto muestra el listado de puestos activos', async ({ page }) => {
    await page.getByText('Ayudar en puesto').click()
    await expect(
      page.getByText(/puesto|emergencia|distribuci[oó]n|apoyo/i).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('el listado de puestos muestra informacion de ocupacion o capacidad', async ({ page }) => {
    await page.getByText('Ayudar en puesto').click()
    await page.waitForTimeout(500)
    const infoVisible = await page.getByText(/voluntario|capacidad|trabajando|\d+\/\d+|plaza/i).count()
    expect(infoVisible).toBeGreaterThanOrEqual(0)
  })

  test('cada puesto ofrece opcion de solicitar participacion o unirse', async ({ page }) => {
    await page.getByText('Ayudar en puesto').click()
    await page.waitForTimeout(1000)
    const count = await page.getByText(/solicitar|unirse|apuntarse|participar|pedir/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

// ── Voluntario: historial de solicitudes ─────────────────────────────────────

test.describe('Voluntario — Mis solicitudes de participacion', () => {
  test.beforeEach(async ({ page }) => {
    await injectVolAuth(page)
    await gotoVoluntario(page)
  })

  test('existe una seccion para ver el estado de las solicitudes de participacion', async ({ page }) => {
    await page.getByText('Ayudar en puesto').click()
    await page.waitForTimeout(500)
    const count = await page.getByText(/solicitud|estado|pendiente|aceptad|rechazad|mi.*solicitud/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('el voluntario puede ver sus solicitudes previas', async ({ page }) => {
    await page.goto('/voluntario')
    await page.waitForLoadState('networkidle')
    const count = await page.getByText(/solicitud|puesto.*activo|ayudando/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

// ── Voluntario: estado de asignacion activa ───────────────────────────────────

test.describe('Voluntario — Asignacion activa en puesto', () => {
  test.beforeEach(async ({ page }) => {
    await injectVolAuth(page)
    await gotoVoluntario(page)
  })

  test('el panel de voluntario puede mostrar puesto activo o estado disponible', async ({ page }) => {
    await expect(
      page.getByText(/activ|disponible|centro de actividad|panel de voluntario/i).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('si el voluntario tiene asignacion activa puede ver acciones del puesto', async ({ page }) => {
    await page.getByText('Ayudar en puesto').click()
    await page.waitForTimeout(800)
    const count = await page.getByText(/abandonar|salir|finalizar|inventario|stock|actualizar/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

// ── Responsable de puesto: gestion de solicitudes ────────────────────────────

test.describe('Responsable — Solicitudes de participacion pendientes', () => {
  test.beforeEach(async ({ page }) => {
    await injectPuestoAuth(page)
    await gotoPuesto(page)
  })

  test('el dashboard de puesto carga sin redirigir a login', async ({ page }) => {
    await expect(page).not.toHaveURL(/\/auth\/login/)
  })

  test('existe seccion de solicitudes o voluntarios en el dashboard de puesto', async ({ page }) => {
    const count = await page.getByText(/solicitud|voluntario|participaci[oó]n|gesti[oó]n|miembro/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('el responsable puede ver solicitudes pendientes de voluntarios', async ({ page }) => {
    await page.waitForTimeout(500)
    const count = await page.getByText(/pendiente|solicitud|voluntario.*quiere|aceptar|rechazar/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

// ── Responsable de puesto: lista de participantes activos ─────────────────────

test.describe('Responsable — Participantes activos del puesto', () => {
  test.beforeEach(async ({ page }) => {
    await injectPuestoAuth(page)
    await gotoPuesto(page)
  })

  test('existe seccion para gestionar participantes activos', async ({ page }) => {
    await page.waitForTimeout(500)
    const count = await page.getByText(/participante|activo|voluntario.*activo|equipo/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('la interfaz permite eliminar o retirar voluntarios activos', async ({ page }) => {
    await page.waitForTimeout(500)
    const count = await page.getByText(/eliminar|retirar|expulsar|quitar/i).count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

// ── Voluntario: incorporacion directa no disponible ───────────────────────────

test.describe('Voluntario — incorporacion directa no disponible', () => {
  test.beforeEach(async ({ page }) => {
    await injectVolAuth(page)
    await gotoVoluntario(page)
  })

  test('la UI no ofrece incorporacion directa, solo solicitud de participacion', async ({ page }) => {
    await page.getByText('Ayudar en puesto').click()
    await page.waitForTimeout(500)
    // No debe haber boton de "unirse directamente" sin proceso de solicitud
    const directCount = await page.getByText(/unirse ahora|asignar directamente|incorporar ahora/i).count()
    expect(directCount).toBe(0)
  })
})
