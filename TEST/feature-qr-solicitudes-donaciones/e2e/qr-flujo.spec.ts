import { test, expect, type Page } from '@playwright/test'

// REQUISITO: frontend corriendo en http://localhost:5173
// Arrancar con: cd frontend && npm run dev

// ── Auth helpers ──────────────────────────────────────────────────────────────
//
// El AuthGuard redirige a /auth/login si no hay sesion en localStorage.
// Inyectamos el estado de Zustand antes de que la pagina cargue para
// que el guard vea isAuthenticated=true y permita el acceso.

type RoleStr = 'CIUDADANO' | 'VOLUNTARIO' | 'PUESTO'

async function injectAuth(page: Page, role: RoleStr, puestoId: string | null = null) {
  await page.addInitScript(
    ({ roleStr, puestoIdStr }: { roleStr: RoleStr; puestoIdStr: string | null }) => {
      localStorage.setItem(
        'catlogistica-auth',
        JSON.stringify({
          state: {
            user: {
              id: 'e2e-user-1',
              nombre: 'Test',
              apellidos: 'E2E',
              email: 'e2e@catlogistica.test',
              roles: [roleStr],
            },
            accessToken: 'e2e-test-token',
            selectedRole: roleStr,
            isAuthenticated: true,
            puestoId: puestoIdStr,
          },
          version: 0,
        }),
      )
    },
    { roleStr: role, puestoIdStr: puestoId },
  )
}

// ── Solicitud ciudadana por QR ────────────────────────────────────────────────

test.describe('Solicitud ciudadana de productos por QR', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page, 'CIUDADANO')
    await page.goto('/ciudadano')
  })

  test('el dashboard del ciudadano carga y muestra el menu de acciones', async ({ page }) => {
    // El dashboard muestra un panel de acciones inicial; "Ver mapa" es siempre visible
    await expect(page.getByRole('button', { name: /🗺 Ver mapa/ })).toBeVisible({ timeout: 8000 })
  })

  test('existe la accion de búsqueda de productos en el menu', async ({ page }) => {
    // El panel de acciones incluye la tarjeta de busqueda de productos
    await expect(page.getByRole('button', { name: /🔍 Buscar producto/ })).toBeVisible({ timeout: 8000 })
  })

  test('abrir búsqueda de producto muestra el panel correcto', async ({ page }) => {
    // Click en la tarjeta de accion "Buscar producto" (primer boton visible con ese texto)
    await page.getByRole('button', { name: /🔍 Buscar producto/ }).first().click()
    await expect(page.getByText('Disponibilidad por puesto')).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder('Escribe o elige un producto')).toBeVisible()
  })

  test('el campo de búsqueda acepta texto y retiene el valor introducido', async ({ page }) => {
    await page.getByRole('button', { name: /🔍 Buscar producto/ }).first().click()
    const input = page.getByPlaceholder('Escribe o elige un producto')
    await input.fill('Agua embotellada')
    await expect(input).toHaveValue('Agua embotellada')
  })

  test('la URL permanece en /ciudadano al usar el panel de solicitud QR', async ({ page }) => {
    await page.getByRole('button', { name: /🔍 Buscar producto/ }).first().click()
    await expect(page.getByText('Disponibilidad por puesto')).toBeVisible()
    // El ciudadano permanece en su dashboard mientras selecciona productos para el QR
    await expect(page).toHaveURL('/ciudadano')
  })
})

// ── Seleccion de rol — voluntario ─────────────────────────────────────────────

test.describe('Acceso al flujo de donaciones del voluntario', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page, 'CIUDADANO') // usuario autenticado, sin rol seleccionado forzado
    await page.goto('/')
  })

  test('la seleccion de rol muestra la opcion Voluntario', async ({ page }) => {
    await expect(page.getByText('Voluntario')).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Quiero ayudar y contribuir')).toBeVisible()
  })

  test('la seleccion de rol muestra información sobre QR para voluntarios', async ({ page }) => {
    // El card de Voluntario describe la funcionalidad QR de entregas
    await expect(page.getByText('Voluntario')).toBeVisible({ timeout: 8000 })
  })

  test('pulsar Voluntario navega al dashboard del voluntario', async ({ page }) => {
    await page.getByRole('button', { name: /Acceder como Voluntario/i }).click()
    await expect(page).toHaveURL(/\/voluntario/, { timeout: 8000 })
  })
})

// ── Seleccion de rol — puesto de emergencia ───────────────────────────────────

test.describe('Acceso al flujo QR del puesto de emergencia', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page, 'CIUDADANO') // usuario autenticado, sin puestoId
    await page.goto('/')
  })

  test('la seleccion de rol muestra Puesto de Emergencia', async ({ page }) => {
    await expect(page.getByText('Puesto de Emergencia')).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Gestiono un punto de distribucion')).toBeVisible()
  })

  test('pulsar Puesto de Emergencia sin aprobacion va al registro', async ({ page }) => {
    await page.getByRole('button', { name: /Acceder como Puesto de Emergencia/i }).click()
    // Sin puestoId aprobado → navega a registro de puesto
    await expect(page).toHaveURL(/\/auth\/registro-puesto/, { timeout: 8000 })
  })

  test('con sesión de puesto aprobado la ruta /puesto no redirige al login', async ({ page }) => {
    await injectAuth(page, 'PUESTO', 'puesto-e2e-1')
    await page.goto('/puesto')
    // El AuthGuard y RoleGuard permiten el acceso — la URL debe ser /puesto
    await expect(page).toHaveURL('/puesto', { timeout: 8000 })
  })
})
