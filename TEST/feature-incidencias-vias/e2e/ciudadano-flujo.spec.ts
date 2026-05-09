import { test, expect } from '@playwright/test'

// REQUISITO: frontend corriendo en http://localhost:5173
// Arrancar con: cd frontend && npm run dev

test.describe('Seleccion de rol', () => {
  test('muestra las tarjetas de rol disponibles al abrir la app', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Ciudadano')).toBeVisible()
    await expect(page.getByText('Voluntario')).toBeVisible()
    await expect(page.getByText('Puesto de Emergencia')).toBeVisible()
    await expect(page.getByText('Coordinador')).not.toBeVisible()
  })

  test('redirige a login al pulsar Ciudadano sin sesion', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Acceder como Ciudadano/i }).click()
    await expect(page).toHaveURL(/\/auth\/login.*role=ciudadano/)
  })

  test('redirige a login al pulsar Voluntario sin sesion', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Acceder como Voluntario/i }).click()
    await expect(page).toHaveURL(/\/auth\/login.*role=voluntario/)
  })

  test('abre el modal informativo del rol Ciudadano', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /informaci.n sobre el rol Ciudadano/i }).click()
    await expect(page.getByRole('dialog', { name: 'Ciudadano' })).toBeVisible()
    await expect(page.getByText(/persona afectada por la emergencia/i)).toBeVisible()
  })
})

test.describe('Dashboard ciudadano', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ciudadano')
  })

  test('muestra el banner de catastrofe activa', async ({ page }) => {
    await expect(page.getByText(/cat.strofe activa/i)).toBeVisible()
  })

  test('muestra el mapa (contenedor Leaflet)', async ({ page }) => {
    const map = page.locator('.leaflet-container')
    await expect(map).toBeVisible()
  })

  test('muestra la lista de puestos de emergencia', async ({ page }) => {
    await expect(page.getByText('Puestos de emergencia')).toBeVisible()
    const puestos = page.locator('text=CEIP La Paz')
    await expect(puestos).toBeVisible()
  })

  test('muestra los botones de accion rapida', async ({ page }) => {
    await expect(page.getByText('Reportar calle')).toBeVisible()
    await expect(page.getByText('Buscar producto')).toBeVisible()
  })
})

test.describe('Inventario de puesto', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ciudadano')
  })

  test('al pulsar un puesto aparecen los botones Ver inventario y Como llegar', async ({ page }) => {
    await page.getByText('CEIP La Paz').click()
    await expect(page.getByText('Ver inventario')).toBeVisible()
    await expect(page.getByText(/C.mo llegar/)).toBeVisible()
  })

  test('al pulsar Ver inventario se abre el panel con productos disponibles', async ({ page }) => {
    await page.getByText('CEIP La Paz').click()
    await page.getByText('Ver inventario').click()
    await expect(page.getByText('Disponible')).toBeVisible()
    await expect(page.getByText('Agua embotellada')).toBeVisible()
  })

  test('el panel de inventario muestra la seccion Necesitamos', async ({ page }) => {
    await page.getByText('CEIP La Paz').click()
    await page.getByText('Ver inventario').click()
    await expect(page.getByText('Necesitamos')).toBeVisible()
  })

  test('el panel de inventario se cierra con el boton cerrar', async ({ page }) => {
    await page.getByText('CEIP La Paz').click()
    await page.getByText('Ver inventario').click()
    await page.getByRole('button', { name: /cerrar/i }).click()
    await expect(page.getByText('Disponible')).not.toBeVisible()
  })
})

test.describe('Reporte de incidencia', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ciudadano')
  })

  test('al pulsar Reportar calle se muestra el formulario de reporte', async ({ page }) => {
    await page.getByText('Reportar calle').click()
    await expect(page.getByText(/reportar|incidencia|calle/i).nth(1)).toBeVisible()
  })
})
