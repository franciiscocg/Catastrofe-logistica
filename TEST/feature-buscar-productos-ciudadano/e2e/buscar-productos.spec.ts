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

const rutaOsrm = {
  code: 'Ok',
  routes: [
    {
      distance: 1500,
      duration: 420,
      geometry: {
        coordinates: [
          [-0.4178, 39.4254],
          [-0.4140, 39.4240],
          [-0.3975, 39.4212],
        ],
      },
      legs: [
        {
          steps: [
            {
              distance: 120,
              name: 'Calle Mayor',
              maneuver: { type: 'depart', modifier: 'straight', location: [-0.4178, 39.4254] },
            },
            {
              distance: 1380,
              name: 'Avenida del Polideportivo',
              maneuver: { type: 'arrive', location: [-0.3975, 39.4212] },
            },
          ],
        },
      ],
    },
  ],
}

async function prepararCiudadano(page: Page, conUbicacion = true) {
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

  if (conUbicacion) {
    await page.context().grantPermissions(['geolocation'])
    await page.context().setGeolocation({ latitude: 39.4254, longitude: -0.4178 })
  }

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

  await page.route('**/route/v1/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(rutaOsrm),
  }))
}

async function abrirBusqueda(page: Page) {
  await page.goto('/ciudadano')
  await page.getByRole('button', { name: /Buscar producto Encuentra/i }).click()
}

test.describe('Panel de búsqueda de productos', () => {
  test.beforeEach(async ({ page }) => {
    await prepararCiudadano(page)
    await abrirBusqueda(page)
  })

  test('abre el selector de productos', async ({ page }) => {
    await expect(page.getByText('Recursos disponibles')).toBeVisible()
    await expect(page.getByText('Buscar productos')).toBeVisible()
    await expect(page.getByPlaceholder('Buscar producto o categoría...')).toBeVisible()
  })

  test('permite buscar y anadir productos a la lista', async ({ page }) => {
    const input = page.getByPlaceholder('Buscar producto o categoría...')
    await input.click()
    await input.fill('agua')
    await page.getByRole('button', { name: /Agua embotellada/i }).first().click()

    await expect(page.getByText(/Tu lista \(1\)/i)).toBeVisible()
    await expect(page.getByText('Agua embotellada').last()).toBeVisible()
    await expect(page.getByText('Ver rutas disponibles')).toBeVisible()
  })

  test('cerrar el panel vuelve al dashboard', async ({ page }) => {
    await page.getByRole('button', { name: 'Volver' }).click()

    await expect(page.getByRole('button', { name: /Ver mapa Consulta puestos/i })).toBeVisible()
  })
})

test.describe('Rutas de productos', () => {
  test('calcula ruta en coche y permite cambiar a pie', async ({ page }) => {
    await prepararCiudadano(page, true)
    await abrirBusqueda(page)

    await page.getByText('Agua embotellada').first().click()
    await page.getByText('Ver rutas disponibles').click()

    await expect(page.getByText('Planificacion de ruta')).toBeVisible()
    await expect(page.getByRole('button', { name: /En coche/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /A pie/i })).toBeVisible()
    await expect(page.getByText(/1\.5 km/)).toBeVisible()

    await page.getByRole('button', { name: /A pie/i }).click()
    await expect(page.getByText(/Calculando ruta a pie|1\.5 km/)).toBeVisible()
  })

  test('inicia navegacion con indicaciones paso a paso', async ({ page }) => {
    await prepararCiudadano(page, true)
    await abrirBusqueda(page)

    await page.getByText('Agua embotellada').first().click()
    await page.getByText('Ver rutas disponibles').click()
    await page.getByRole('button', { name: /Iniciar navegaci.n/i }).click()

    await expect(page.getByText(/Empieza por Calle Mayor|Has llegado a tu destino/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Finalizar/i })).toBeVisible()
  })
})
