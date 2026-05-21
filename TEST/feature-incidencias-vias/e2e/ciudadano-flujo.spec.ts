import { test, expect, type Page } from '@playwright/test'

const puestos = [
  {
    id: '1',
    nombre: 'CEIP La Paz',
    direccion: 'Calle Mayor 12',
    latitud: 39.4254,
    longitud: -0.4178,
    necesidades: 3,
  },
  {
    id: '2',
    nombre: 'Pabellon Municipal Benetusser',
    direccion: 'Avenida del Polideportivo 4',
    latitud: 39.4212,
    longitud: -0.3975,
    necesidades: 1,
  },
]

async function prepararCiudadano(page: Page) {
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 39.4254, longitude: -0.4178 })

  await page.addInitScript(() => {
    window.localStorage.setItem('catlogistica-auth', JSON.stringify({
      state: {
        user: {
          id: 'user-e2e',
          email: 'ciudadano@example.com',
          nombre: 'Maria',
          apellidos: 'Garcia',
          roles: ['CIUDADANO'],
        },
        accessToken: 'e2e-token',
        selectedRole: 'ciudadano',
        isAuthenticated: true,
        puestoId: null,
      },
      version: 0,
    }))
  })

  await page.route('**/api/puestos', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ puestos }),
  }))

  await page.route('**/api/incidencias**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ incidencias: [] }),
  }))

  await page.route('**/api/inventario/puesto/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ inventario: [] }),
  }))
}

test.describe('Acceso ciudadano', () => {
  test('sin sesion la raiz redirige a login', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /iniciar sesion/i })).toBeVisible()
  })

  test('con sesion muestra el dashboard ciudadano', async ({ page }) => {
    await prepararCiudadano(page)
    await page.goto('/ciudadano')

    await expect(page.getByText('Acceso ciudadano')).toBeVisible()
    await expect(page.getByText('¿Qué necesitas hacer?')).toBeVisible()
    await expect(page.getByRole('button', { name: /Ver mapa/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Buscar producto/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Reportar incidencia/i })).toBeVisible()
  })

  test('la accion Ver mapa muestra el mapa ciudadano', async ({ page }) => {
    await prepararCiudadano(page)
    await page.goto('/ciudadano')

    await page.getByRole('button', { name: /Ver mapa/i }).click()
    await expect(page.locator('.leaflet-container')).toBeVisible()
  })
})

test.describe('Reporte de incidencias', () => {
  test.beforeEach(async ({ page }) => {
    await prepararCiudadano(page)
    await page.goto('/ciudadano')
  })

  test('al pulsar Reportar calle se muestra el formulario de reporte', async ({ page }) => {
    await page.getByRole('button', { name: /Reportar incidencia/i }).click()

    await expect(page.getByText('Reportar calle cortada')).toBeVisible()
    await expect(page.getByText('Seleccionar ubicación')).toBeVisible()
    await expect(page.getByRole('button', { name: /Usar mi ubicaci.n actual/i })).toBeVisible()
  })
})
