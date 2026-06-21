import { expect, test } from '@playwright/test'

test('un ciudadano busca un producto y abre una ruta segura', async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem('catlogistica-auth', JSON.stringify({
      state: { selectedRole: 'ciudadano', puestoId: null },
      version: 2,
    }))
  })
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 39.4254, longitude: -0.4178 })

  await page.route('**/api/auth/refresh', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      user: { id: 'user-e2e', email: 'ciudadano@example.com', nombre: 'Maria', apellidos: 'Garcia', roles: ['CIUDADANO'] },
      accessToken: 'e2e-token',
      accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    }),
  }))
  await page.route('**/api/puestos', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ puestos: [{
      id: 'puesto-1', nombre: 'CEIP La Paz', direccion: 'Calle Mayor 12',
      latitud: 39.4254, longitud: -0.4178, necesidades: 0,
    }] }),
  }))
  await page.route('**/api/incidencias**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ incidencias: [] }),
  }))
  await page.route('**/api/inventario', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ inventario: [{
      id: 'inv-1', puestoId: 'puesto-1', tipo: 'DISPONIBLE', cantidad: 20,
      producto: { id: 'prod-1', nombre: 'Agua embotellada', categoria: 'Agua', unidad: 'litros' },
    }] }),
  }))
  await page.route('**/route/v1/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'Ok', routes: [{
      distance: 800,
      duration: 300,
      geometry: { coordinates: [[-0.4178, 39.4254], [-0.4178, 39.4254]] },
      legs: [{ steps: [{
        distance: 800,
        name: 'Calle Mayor',
        maneuver: { type: 'arrive', location: [-0.4178, 39.4254] },
      }] }],
    }] }),
  }))

  await page.goto('/ciudadano')
  await page.getByRole('button', { name: /Buscar producto Encuentra/i }).click()
  await page.getByRole('searchbox').fill('agua')
  await page.getByRole('button', { name: /Agua embotellada/i }).first().click()
  await page.getByRole('button', { name: /Ver mejores opciones/i }).click()

  await expect(page.getByText('Mejores opciones')).toBeVisible()
  await expect(page.getByText(/0\.8 km/)).toBeVisible()
})
