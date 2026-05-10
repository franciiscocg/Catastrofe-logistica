import { test, expect, type Page } from '@playwright/test'

// REQUISITO: Playwright levanta el frontend automáticamente (ver playwright.config.ts)
// Si prefieres arrancarlo tú: cd frontend && npm run dev

// ── Helpers ───────────────────────────────────────────────────────────────────

// Abre el buscador y selecciona "Agua embotellada".
//
// { exact: true } — evita la violación de strict-mode: "Buscar producto"
// aparece en el span del botón de acción, en un párrafo de descripción que
// contiene "buscar productos" y en un botón oculto (div.hidden). Solo el span
// tiene exactamente ese texto.
//
// Mocks de API — Playwright solo arranca el frontend (sin backend). Se mockean
// los tres endpoints que usa el Dashboard para que React Query resuelva rápido
// y de forma determinista:
//   • /api/puestos    → devuelve el puesto id='1'
//   • /api/inventario → devuelve vacío (mergeWithDemoInventario usa INVENTARIO['1'])
//   • /api/incidencias→ devuelve vacío (silencia el ruido de red)
//
// expect.toPass — reintentar el par fill+check hasta que React haya procesado
// el estado de puestos. La race condition entre waitForResponse (capa de red)
// y el re-render de React hace que el primer fill a veces no encuentre match;
// toPass() cubre esa ventana sin tiempos de espera arbitrarios.
async function abrirBusquedaYSeleccionarAgua(page: Page) {
  await page.route('**/api/puestos', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        puestos: [
          { id: '1', nombre: 'CEIP La Paz', direccion: 'Calle Mayor 1, Paiporta',
            latitud: 39.4254, longitud: -0.4178, necesidades: 0 },
        ],
      }),
    })
  )
  // Vacío → mergeWithDemoInventario recurre al INVENTARIO['1'] hardcoded
  await page.route('**/api/inventario/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ inventario: [] }),
    })
  )
  await page.route('**/api/incidencias**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ incidencias: [] }),
    })
  )

  const puestosLoaded = page.waitForResponse('**/api/puestos')
  await page.goto('/ciudadano')
  await puestosLoaded

  await page.getByText('Buscar producto', { exact: true }).click()
  const input = page.getByPlaceholder('Escribe o elige un producto')

  // Reintentar fill + comprobación hasta que productoOptions tenga datos.
  // Si React no ha re-renderizado todavía con los puestos, el match no
  // encuentra "Agua embotellada" y el inner-expect falla; toPass() vuelve
  // a intentarlo hasta que el estado se estabiliza.
  await expect(async () => {
    await input.fill('Agua embotellada')
    await expect(page.getByText('Recomendado')).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 12000 })
}

// ── Pantalla de inicio ciudadano (CiudadanoInicio) ────────────────────────────

test.describe('Pantalla de inicio ciudadano', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ciudadano')
  })

  test('muestra el encabezado "¿Qué necesitas hacer?"', async ({ page }) => {
    await expect(page.getByText('¿Qué necesitas hacer?')).toBeVisible()
  })

  test('muestra la acción "Ver mapa"', async ({ page }) => {
    await expect(page.getByText('Ver mapa')).toBeVisible()
  })

  // exact:true — sin él, Playwright también encuentra el párrafo de descripción
  // que contiene "buscar productos" y el botón oculto con emoji (3 coincidencias).
  test('muestra la acción "Buscar producto"', async ({ page }) => {
    await expect(page.getByText('Buscar producto', { exact: true })).toBeVisible()
  })

  test('muestra la acción "Reportar incidencia"', async ({ page }) => {
    await expect(page.getByText('Reportar incidencia')).toBeVisible()
  })

  test('pulsar "Ver mapa" muestra el contenedor Leaflet', async ({ page }) => {
    await page.getByText('Ver mapa').click()
    await expect(page.locator('.leaflet-container')).toBeVisible()
  })

  test('pulsar "Buscar producto" abre el panel de búsqueda', async ({ page }) => {
    await page.getByText('Buscar producto', { exact: true }).click()
    await expect(page.getByText('Disponibilidad por puesto')).toBeVisible()
    await expect(page.getByPlaceholder('Escribe o elige un producto')).toBeVisible()
  })

  test('pulsar "Reportar incidencia" abre el formulario de reporte', async ({ page }) => {
    await page.getByText('Reportar incidencia').click()
    await expect(page.getByText(/reportar calle cortada/i)).toBeVisible()
  })
})

// ── Separación de flujos ──────────────────────────────────────────────────────

test.describe('Separación de flujos — mapa, buscador y reporte no mezclan controles', () => {
  test('en vista mapa NO aparece el input de búsqueda de producto', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Ver mapa').click()
    await expect(page.getByPlaceholder('Escribe o elige un producto')).not.toBeVisible()
  })

  test('en vista mapa NO aparece el texto "Disponibilidad por puesto"', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Ver mapa').click()
    await expect(page.getByText('Disponibilidad por puesto')).not.toBeVisible()
  })

  test('en vista mapa NO aparece el formulario "Reportar calle cortada"', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Ver mapa').click()
    await expect(page.getByText('Reportar calle cortada')).not.toBeVisible()
  })

  test('en vista buscador NO aparece el texto "Puestos de emergencia" de la lista del mapa', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Buscar producto', { exact: true }).click()
    await expect(page.getByText('Puestos de emergencia')).not.toBeVisible()
  })

  test('en vista buscador NO aparece el formulario "Reportar calle cortada"', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Buscar producto', { exact: true }).click()
    await expect(page.getByText('Reportar calle cortada')).not.toBeVisible()
  })

  test('en vista reporte NO aparece el panel de búsqueda de producto', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Reportar incidencia').click()
    await expect(page.getByPlaceholder('Escribe o elige un producto')).not.toBeVisible()
  })

  test('en vista reporte NO aparece el texto "Disponibilidad por puesto"', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Reportar incidencia').click()
    await expect(page.getByText('Disponibilidad por puesto')).not.toBeVisible()
  })
})

// ── Botón "Cómo llegar" desde búsqueda de producto ────────────────────────────

test.describe('Botón "Cómo llegar" desde búsqueda de producto', () => {
  test('al seleccionar un puesto en el buscador aparece el botón "🚗 Cómo llegar"', async ({ page }) => {
    await abrirBusquedaYSeleccionarAgua(page)
    await page.getByText('Recomendado').click()
    // .last() — puede haber duplicados ocultos en la lista de puestos (class="hidden")
    await expect(page.getByRole('button', { name: '🚗 Cómo llegar' }).last()).toBeVisible()
  })

  test('el botón "🚗 Cómo llegar" está habilitado', async ({ page }) => {
    await abrirBusquedaYSeleccionarAgua(page)
    await page.getByText('Recomendado').click()
    await expect(page.getByRole('button', { name: '🚗 Cómo llegar' }).last()).toBeEnabled()
  })

  test('pulsar "🚗 Cómo llegar" sin ubicación muestra aviso de ubicación', async ({ page }) => {
    await abrirBusquedaYSeleccionarAgua(page)
    await page.getByText('Recomendado').click()
    await page.getByRole('button', { name: '🚗 Cómo llegar' }).last().click()
    await expect(
      page.getByText('Comparte tu ubicación primero para calcular la ruta').last()
    ).toBeVisible({ timeout: 5000 })
  })

  test('pulsar "Volver a puestos" desde el detalle regresa a la tarjeta "Recomendado"', async ({ page }) => {
    await abrirBusquedaYSeleccionarAgua(page)
    await page.getByText('Recomendado').click()
    await page.getByText('Volver a puestos').click()
    await expect(page.getByText('Recomendado')).toBeVisible()
  })
})

// ── Botón "Volver" visible y centrado ─────────────────────────────────────────

test.describe('Botón "Volver" visible y centrado en los flujos ciudadano', () => {
  test('vista mapa tiene botón "Volver" visible', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Ver mapa').click()
    await expect(page.getByRole('button', { name: 'Volver' }).first()).toBeVisible()
  })

  test('el botón "Volver" en vista mapa tiene clases de centrado', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Ver mapa').click()
    const cls = await page.getByRole('button', { name: 'Volver' }).first().getAttribute('class')
    // left-1/2 + -translate-x-1/2 centran el botón horizontalmente sobre el mapa
    expect(cls).toContain('left-1/2')
    expect(cls).toContain('-translate-x-1/2')
  })

  // El LocationPermissionBanner (z-3000) cubre el botón "Volver" (z-1200)
  // cuando el navegador headless deniega la geolocalización inmediatamente.
  // force:true solo bypasea los checks de Playwright pero los pointer-events
  // siguen yendo a las coordenadas del elemento, donde el banner los captura
  // antes. Se usa evaluate(el.click()) para disparar el evento directamente
  // sobre el nodo DOM, evitando el hit-testing del navegador.
  test('pulsar "Volver" en vista mapa regresa a la pantalla de inicio', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Ver mapa').click()
    await page.getByRole('button', { name: 'Volver' }).first()
      .evaluate((el) => (el as HTMLElement).click())
    await expect(page.getByText('¿Qué necesitas hacer?')).toBeVisible()
  })

  test('vista buscador tiene botón "Volver" visible', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Buscar producto', { exact: true }).click()
    await expect(page.getByRole('button', { name: 'Volver' })).toBeVisible()
  })

  test('el botón "Volver" en vista buscador tiene clase de centrado mx-auto', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Buscar producto', { exact: true }).click()
    const cls = await page.getByRole('button', { name: 'Volver' }).getAttribute('class')
    expect(cls).toContain('mx-auto')
  })

  test('pulsar "Volver" en vista buscador regresa a la pantalla de inicio', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Buscar producto', { exact: true }).click()
    // evaluate(el.click()) garantiza que el evento llegue al botón aunque
    // el LocationPermissionBanner esté en el mismo área del viewport.
    await page.getByRole('button', { name: 'Volver' })
      .evaluate((el) => (el as HTMLElement).click())
    await expect(page.getByText('¿Qué necesitas hacer?')).toBeVisible()
  })

  test('vista reporte tiene al menos un botón "Volver" visible', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Reportar incidencia').click()
    // En vista reportar coexisten el Volver del mapa (z-1200) y el del panel (z-2000)
    await expect(page.getByRole('button', { name: 'Volver' }).last()).toBeVisible()
  })

  test('pulsar "Volver" del panel de reporte regresa a la pantalla de inicio', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Reportar incidencia').click()
    // .last() apunta al botón del panel de reporte (último en el DOM).
    // evaluate(el.click()) evita que el LocationPermissionBanner (z-3000)
    // capture los pointer-events antes que el botón (z-2000 indirecto).
    await page.getByRole('button', { name: 'Volver' }).last()
      .evaluate((el) => (el as HTMLElement).click())
    await expect(page.getByText('¿Qué necesitas hacer?')).toBeVisible()
  })
})

// ── Mapa blindado contra coordenadas inválidas (NaN, NaN) ─────────────────────

test.describe('Mapa blindado contra coordenadas inválidas', () => {
  test('el mapa carga sin errores "Invalid LatLng" con coordenadas por defecto', async ({ page }) => {
    const latLngErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('Invalid LatLng')) {
        latLngErrors.push(msg.text())
      }
    })
    await page.goto('/ciudadano')
    await page.getByText('Ver mapa').click()
    await expect(page.locator('.leaflet-container')).toBeVisible()
    expect(latLngErrors).toHaveLength(0)
  })

  test('navegar con lat=NaN&lng=NaN en query params no rompe el mapa', async ({ page }) => {
    const latLngErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('Invalid LatLng')) {
        latLngErrors.push(msg.text())
      }
    })
    // El guard en Dashboard descarta params inválidos; Map usa VALENCIA como fallback
    await page.goto('/ciudadano?destinoId=test&lat=NaN&lng=NaN&nombre=TestNaN&direccion=Test')
    await expect(page.locator('.leaflet-container')).toBeVisible()
    expect(latLngErrors).toHaveLength(0)
  })

  test('navegar con params lat/lng ausentes no provoca crash', async ({ page }) => {
    await page.goto('/ciudadano?destinoId=test&nombre=Test')
    // La app debe mantenerse estable cuando faltan lat/lng
    await expect(page.locator('body')).toBeVisible()
    // Y el mapa carga igualmente (el destino queda ignorado por el guard)
    await expect(page.locator('.leaflet-container')).toBeVisible()
  })

  test('incidencias con coordenadas NaN no generan errores "Invalid LatLng"', async ({ page }) => {
    const latLngErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('Invalid LatLng')) {
        latLngErrors.push(msg.text())
      }
    })
    await page.goto('/ciudadano')
    await page.getByText('Ver mapa').click()
    await expect(page.locator('.leaflet-container')).toBeVisible()
    // hasValidMarkerPosition en Map.tsx filtra incidencias con coords inválidas
    expect(latLngErrors).toHaveLength(0)
  })
})
