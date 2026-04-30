import { test, expect } from '@playwright/test'

// REQUISITO: frontend corriendo en http://localhost:5173
// Arrancar con: cd frontend && npm run dev

test.describe('Selección de rol', () => {
  test('muestra las 4 tarjetas de rol al abrir la app', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Ciudadano')).toBeVisible()
    await expect(page.getByText('Voluntario / Donante')).toBeVisible()
    await expect(page.getByText('Puesto de Emergencia')).toBeVisible()
    await expect(page.getByText('Coordinador')).toBeVisible()
  })

  test('navega a /ciudadano al pulsar la tarjeta Ciudadano', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Ciudadano').click()
    await expect(page).toHaveURL(/\/ciudadano/)
  })

  test('redirige a login al pulsar Voluntario sin sesión', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Voluntario / Donante').click()
    await expect(page).toHaveURL(/\/auth\/login.*role=voluntario/)
  })

  test('redirige a login al pulsar Coordinador sin sesión', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Coordinador').click()
    await expect(page).toHaveURL(/\/auth\/login.*role=coordinador/)
  })
})

test.describe('Dashboard ciudadano', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ciudadano')
  })

  test('muestra el banner de catástrofe activa', async ({ page }) => {
    await expect(page.getByText(/catástrofe activa/i)).toBeVisible()
  })

  test('muestra el mapa (contenedor Leaflet)', async ({ page }) => {
    const map = page.locator('.leaflet-container')
    await expect(map).toBeVisible()
  })

  test('muestra la lista de puestos de emergencia', async ({ page }) => {
    await expect(page.getByText('Puestos de emergencia')).toBeVisible()
    // Al menos un puesto visible
    const puestos = page.locator('text=CEIP La Paz')
    await expect(puestos).toBeVisible()
  })

  test('muestra los botones de acción rápida', async ({ page }) => {
    await expect(page.getByText('Reportar calle')).toBeVisible()
    await expect(page.getByText('Buscar producto')).toBeVisible()
  })
})

test.describe('Inventario de puesto', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ciudadano')
  })

  test('al pulsar un puesto aparecen los botones Ver inventario y Cómo llegar', async ({ page }) => {
    await page.getByText('CEIP La Paz').click()
    await expect(page.getByText('Ver inventario')).toBeVisible()
    await expect(page.getByText('Cómo llegar')).toBeVisible()
  })

  test('al pulsar Ver inventario se abre el panel con productos disponibles', async ({ page }) => {
    await page.getByText('CEIP La Paz').click()
    await page.getByText('Ver inventario').click()
    await expect(page.getByText('Disponible')).toBeVisible()
    await expect(page.getByText('Agua embotellada')).toBeVisible()
  })

  test('el panel de inventario muestra la sección Necesitamos', async ({ page }) => {
    await page.getByText('CEIP La Paz').click()
    await page.getByText('Ver inventario').click()
    await expect(page.getByText('Necesitamos')).toBeVisible()
  })

  test('el panel de inventario se cierra con el botón ✕', async ({ page }) => {
    await page.getByText('CEIP La Paz').click()
    await page.getByText('Ver inventario').click()
    await page.getByRole('button', { name: '✕' }).click()
    await expect(page.getByText('Disponible')).not.toBeVisible()
  })
})

test.describe('Reporte de incidencia', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ciudadano')
  })

  test('al pulsar Reportar calle se muestra el formulario de reporte', async ({ page }) => {
    await page.getByText('Reportar calle').click()
    // El formulario o panel de reporte debe aparecer
    await expect(page.getByText(/reportar|incidencia|calle/i).nth(1)).toBeVisible()
  })
})
