import { test, expect, type BrowserContext } from '@playwright/test'

// REQUISITO: frontend corriendo en http://localhost:5175
// Arrancar con: cd frontend && npm run dev

// ── Helpers ───────────────────────────────────────────────────────────────────

async function grantGeolocation(context: BrowserContext, lat = 39.4254, lng = -0.4178) {
  await context.setGeolocation({ latitude: lat, longitude: lng })
  await context.grantPermissions(['geolocation'])
}

// ── Aviso persistente — ubicación bloqueada o desactivada ─────────────────────

test.describe('Aviso persistente de ubicación bloqueada', () => {
  // Sin llamar a grantPermissions, Chrome headless dispara el error callback de
  // watchPosition. Según cómo resuelva navigator.permissions.query en la sesión
  // automatizada, el título puede ser "Ubicacion bloqueada" (permissionState =
  // 'denied') o "Ubicacion desactivada" (permissionState = 'prompt'/'granted').
  // Los tests comprueban el comportamiento observable en ambos casos.

  test('el banner aparece cuando los permisos de geolocalización están denegados', async ({ page }) => {
    await page.goto('/ciudadano')
    await expect(page.getByRole('button', { name: 'Activar ubicacion' })).toBeVisible({ timeout: 5000 })
  })

  test('el banner muestra un título de aviso de ubicación', async ({ page }) => {
    await page.goto('/ciudadano')
    // El título exacto depende del estado de permisos reportado por el navegador
    await expect(
      page.getByText('Ubicacion bloqueada').or(page.getByText('Ubicacion desactivada'))
    ).toBeVisible({ timeout: 5000 })
  })

  test('el banner muestra instrucciones de activación de ubicación', async ({ page }) => {
    await page.goto('/ciudadano')
    // El texto varía según si el permiso está bloqueado o solo desactivado
    await expect(
      page.getByText(/permisos del navegador/i).or(page.getByText(/ordenar puestos/i))
    ).toBeVisible({ timeout: 5000 })
  })

  test('el banner permanece visible después de interacciones en la página', async ({ page }) => {
    await page.goto('/ciudadano')
    await expect(page.getByRole('button', { name: 'Activar ubicacion' })).toBeVisible({ timeout: 5000 })
    await page.mouse.move(400, 300)
    await page.mouse.click(400, 300)
    await expect(page.getByRole('button', { name: 'Activar ubicacion' })).toBeVisible()
  })

  test('el banner está presente en móvil', async ({ page }) => {
    await page.goto('/ciudadano')
    await expect(page.getByRole('button', { name: 'Activar ubicacion' })).toBeVisible({ timeout: 5000 })
  })
})

// ── Sin aviso cuando la ubicación está concedida ──────────────────────────────

test.describe('Proveedor global — ubicación concedida', () => {
  test('el banner NO aparece cuando la geolocalización está concedida', async ({ page, context }) => {
    await grantGeolocation(context)
    await page.goto('/ciudadano')
    await page.waitForTimeout(1500)
    await expect(page.getByRole('button', { name: 'Activar ubicacion' })).not.toBeVisible()
  })

  test('la posición se persiste en sessionStorage durante la sesión', async ({ page, context }) => {
    await grantGeolocation(context)
    await page.goto('/ciudadano')
    await page.waitForTimeout(1500)

    const stored = await page.evaluate(() =>
      sessionStorage.getItem('catastrofe-logistica:last-geolocation')
    )
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.lat).toBeCloseTo(39.4254, 3)
    expect(parsed.lng).toBeCloseTo(-0.4178, 3)
  })

  test('la posición almacenada contiene todos los campos requeridos', async ({ page, context }) => {
    await grantGeolocation(context)
    await page.goto('/ciudadano')
    await page.waitForTimeout(1500)

    const stored = await page.evaluate(() =>
      sessionStorage.getItem('catastrofe-logistica:last-geolocation')
    )
    const parsed = JSON.parse(stored!)
    expect(typeof parsed.lat).toBe('number')
    expect(typeof parsed.lng).toBe('number')
    expect(typeof parsed.accuracy).toBe('number')
    expect(typeof parsed.timestamp).toBe('number')
  })
})

// ── Compartir ubicación entre pantallas ───────────────────────────────────────

test.describe('Ubicación compartida en todas las pantallas', () => {
  test('la ubicación concedida está disponible en la ruta /ciudadano sin mostrar el banner', async ({ page, context }) => {
    await grantGeolocation(context)
    await page.goto('/ciudadano')
    await page.waitForTimeout(1500)
    await expect(page.getByRole('button', { name: 'Activar ubicacion' })).not.toBeVisible()
  })

  test('la posición del sessionStorage se reutiliza al recargar la página', async ({ page, context }) => {
    await grantGeolocation(context)
    await page.goto('/ciudadano')
    await page.waitForTimeout(1500)

    const stored = await page.evaluate(() =>
      sessionStorage.getItem('catastrofe-logistica:last-geolocation')
    )
    expect(stored).not.toBeNull()

    // Recargar: el sessionStorage persiste en la misma sesión del navegador
    await page.reload()
    await page.waitForTimeout(500)

    const storedAfterReload = await page.evaluate(() =>
      sessionStorage.getItem('catastrofe-logistica:last-geolocation')
    )
    expect(storedAfterReload).not.toBeNull()
    expect(JSON.parse(storedAfterReload!).lat).toBeCloseTo(39.4254, 3)
  })
})

// ── Botón Localizarme — mapa del ciudadano ────────────────────────────────────

test.describe('Botón Localizarme en el mapa de Ciudadano', () => {
  test('el botón "Localizarme" es visible en el dashboard del ciudadano', async ({ page }) => {
    await page.goto('/ciudadano')
    await expect(page.getByText(/Localizarme/i)).toBeVisible()
  })

  test('el mapa Leaflet se renderiza en el dashboard del ciudadano', async ({ page }) => {
    await page.goto('/ciudadano')
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 3000 })
  })

  test('el botón interno de localización del mapa (📍) está presente en el contenedor Leaflet', async ({ page }) => {
    await page.goto('/ciudadano')
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('[title="Mi ubicación"]')).toBeVisible()
  })

  test('pulsar "Localizarme" con ubicación concedida devuelve el botón al estado normal', async ({ page, context }) => {
    await grantGeolocation(context)
    await page.goto('/ciudadano')
    await page.waitForTimeout(500)

    await page.getByText(/Localizarme/i).click()

    // Tras recibir la posición el botón vuelve al estado estático
    await expect(page.getByText('📍 Localizarme')).toBeVisible({ timeout: 5000 })
  })

  test('con ubicación concedida el mapa existe y no hay aviso de error de ubicación', async ({ page, context }) => {
    await grantGeolocation(context)
    await page.goto('/ciudadano')
    await page.waitForTimeout(1500)

    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Activar ubicacion' })).not.toBeVisible()
  })
})
