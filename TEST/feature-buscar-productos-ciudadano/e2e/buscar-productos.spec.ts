import { test, expect, type Page } from '@playwright/test'

// REQUISITO: frontend corriendo en http://localhost:5173
// Arrancar con: cd frontend && npm run dev

// ── Helpers ───────────────────────────────────────────────────────────────────

// Abre el panel de búsqueda y selecciona "Agua embotellada" rellenando el input
// con el nombre exacto (disparar onChange → match), NO haciendo clic en el
// dropdown porque el onBlur oculta las sugerencias antes del clic.
async function abrirYSeleccionarAgua(page: Page) {
  await page.goto('/ciudadano')
  await page.getByText('Buscar producto').click()
  const input = page.getByPlaceholder('Escribe o elige un producto')
  await input.fill('Agua embotellada')
  await expect(page.getByText('Recomendado')).toBeVisible({ timeout: 3000 })
}

// Los elementos siguientes aparecen DOS veces en el DOM:
//   1. En las tarjetas del listado de puestos (ocultas con class="hidden" cuando vista='buscar')
//   2. En el BuscarProductoSheet (renderizado al FINAL del documento)
// Playwright strict mode falla aunque uno esté oculto, y .first() devuelve el
// oculto (está antes en el DOM). Usamos .last() para apuntar siempre al del sheet.
const comoLlegarEnSheet    = (page: Page) => page.getByRole('button', { name: '🚗 Cómo llegar' }).last()
const calculandoEnSheet    = (page: Page) => page.getByText('Calculando ruta segura...').last()
const cancelarEnSheet      = (page: Page) => page.getByText('Cancelar busqueda de ruta').last()
const errorUbicacionSheet  = (page: Page) => page.getByText('Comparte tu ubicación primero para calcular la ruta').last()

// ── Panel de búsqueda ─────────────────────────────────────────────────────────

test.describe('Panel de búsqueda de productos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ciudadano')
  })

  test('el botón "Buscar producto" está visible en el dashboard', async ({ page }) => {
    await expect(page.getByText('Buscar producto')).toBeVisible()
  })

  test('pulsar "Buscar producto" abre el panel de búsqueda', async ({ page }) => {
    await page.getByText('Buscar producto').click()
    await expect(page.getByText('Disponibilidad por puesto')).toBeVisible()
    await expect(page.getByPlaceholder('Escribe o elige un producto')).toBeVisible()
  })

  test('abrir búsqueda oculta la lista de puestos', async ({ page }) => {
    await expect(page.getByText('Puestos de emergencia')).toBeVisible()
    await page.getByText('Buscar producto').click()
    await expect(page.getByText('Puestos de emergencia')).not.toBeVisible()
  })

  test('abrir búsqueda oculta el botón "Reportar calle"', async ({ page }) => {
    await expect(page.getByText('Reportar calle')).toBeVisible()
    await page.getByText('Buscar producto').click()
    await expect(page.getByText('Reportar calle')).not.toBeVisible()
  })

  test('cerrar el panel restaura la lista de puestos', async ({ page }) => {
    await page.getByText('Buscar producto').click()
    await page.getByRole('button', { name: 'x' }).click()
    await expect(page.getByText('Puestos de emergencia')).toBeVisible()
  })
})

// ── Autocompletado ────────────────────────────────────────────────────────────

test.describe('Autocompletado de productos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Buscar producto').click()
  })

  test('las sugerencias aparecen al hacer foco en el input', async ({ page }) => {
    const input = page.getByPlaceholder('Escribe o elige un producto')
    await input.click()
    // Debe mostrar al menos un producto del inventario
    await expect(page.getByText('Agua embotellada')).toBeVisible()
  })

  test('escribir filtra las sugerencias por nombre', async ({ page }) => {
    const input = page.getByPlaceholder('Escribe o elige un producto')
    await input.click()
    await input.fill('man')
    await expect(page.getByText('Mantas')).toBeVisible()
  })

  test('rellenar el nombre exacto selecciona el producto y muestra "Recomendado"', async ({ page }) => {
    const input = page.getByPlaceholder('Escribe o elige un producto')
    await input.fill('Agua embotellada')
    await expect(page.getByText('Recomendado')).toBeVisible()
  })
})

// ── Recomendación de puesto ───────────────────────────────────────────────────

test.describe('Recomendación de puesto', () => {
  test('seleccionar producto muestra la tarjeta "Recomendado"', async ({ page }) => {
    await abrirYSeleccionarAgua(page)
    await expect(page.getByText('Recomendado')).toBeVisible()
  })

  test('la tarjeta recomendada muestra la cantidad disponible', async ({ page }) => {
    await abrirYSeleccionarAgua(page)
    // El texto "X litros disponibles" aparece en la tarjeta recomendada (y en las demás)
    // Usamos first() para evitar strict-mode violation cuando hay varios puestos con litros
    await expect(page.getByText(/\d+ litros disponibles/).first()).toBeVisible()
  })

  test('clicar la tarjeta recomendada muestra el botón "Cómo llegar"', async ({ page }) => {
    await abrirYSeleccionarAgua(page)
    await page.getByText('Recomendado').click()
    // .last() porque hay dos botones con ese texto: uno en el sheet (visible)
    // y otro en las tarjetas de puestos ocultas con class="hidden"
    await expect(comoLlegarEnSheet(page)).toBeVisible()
  })

  test('la vista de detalle muestra los productos disponibles del puesto', async ({ page }) => {
    await abrirYSeleccionarAgua(page)
    await page.getByText('Recomendado').click()
    await expect(page.getByText('Productos disponibles')).toBeVisible()
    // exact:true evita ambigüedad con "Seleccionado: Agua embotellada"
    await expect(page.getByText('Agua embotellada', { exact: true })).toBeVisible()
  })

  test('"Volver a puestos" sale de la vista de detalle', async ({ page }) => {
    await abrirYSeleccionarAgua(page)
    await page.getByText('Recomendado').click()
    await page.getByText('Volver a puestos').click()
    await expect(page.getByText('Recomendado')).toBeVisible()
  })
})

// ── Alerta sin ubicación ──────────────────────────────────────────────────────

test.describe('Mensaje cuando no hay ubicación', () => {
  test('muestra aviso de ubicación cuando userPosition es null', async ({ page }) => {
    await page.goto('/ciudadano')
    await page.getByText('Buscar producto').click()
    // Sin compartir ubicación, debe mostrar el aviso de recomendación sin distancia
    await expect(page.getByText(/Comparte tu ubicacion/i)).toBeVisible()
  })

  test('al clicar "Cómo llegar" sin ubicación muestra error', async ({ page }) => {
    await abrirYSeleccionarAgua(page)
    await page.getByText('Recomendado').click()
    await comoLlegarEnSheet(page).click()
    await expect(errorUbicacionSheet(page)).toBeVisible({ timeout: 5000 })
  })
})

// ── Indicador de carga y cancelación ─────────────────────────────────────────

test.describe('Cálculo de ruta — indicador y cancelación', () => {
  // Helper: localiza al usuario ANTES de abrir el panel de búsqueda.
  // Si el panel ya está abierto, el sheet (z-2000) tapa el botón "Localizarme".
  async function localizarYAbrirBusqueda(page: Page) {
    await page.context().setGeolocation({ latitude: 39.4254, longitude: -0.4178 })
    await page.context().grantPermissions(['geolocation'])
    await page.goto('/ciudadano')
    // Localizar con el panel cerrado (botón accesible)
    await page.getByText(/Localizarme/i).click()
    await page.waitForTimeout(800) // dejar que la Geolocation API resuelva
    // Abrir panel y seleccionar producto
    await page.getByText('Buscar producto').click()
    const input = page.getByPlaceholder('Escribe o elige un producto')
    await input.fill('Agua embotellada')
    await expect(page.getByText('Recomendado')).toBeVisible({ timeout: 3000 })
    await page.getByText('Recomendado').click()
  }

  test('aparece "Calculando ruta segura..." al clicar "Cómo llegar"', async ({ page }) => {
    await page.route('**/router.project-osrm.org/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      await route.continue()
    })

    await localizarYAbrirBusqueda(page)
    await comoLlegarEnSheet(page).click()
    await expect(calculandoEnSheet(page)).toBeVisible({ timeout: 4000 })
  })

  test('aparece el botón "Cancelar búsqueda de ruta" durante el cálculo', async ({ page }) => {
    await page.route('**/router.project-osrm.org/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      await route.continue()
    })

    await localizarYAbrirBusqueda(page)
    await comoLlegarEnSheet(page).click()
    await expect(cancelarEnSheet(page)).toBeVisible({ timeout: 4000 })
  })

  test('cancelar la búsqueda oculta el indicador de carga', async ({ page }) => {
    await page.route('**/router.project-osrm.org/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 15000))
      await route.continue()
    })

    await localizarYAbrirBusqueda(page)
    await comoLlegarEnSheet(page).click()
    await expect(calculandoEnSheet(page)).toBeVisible({ timeout: 4000 })
    await cancelarEnSheet(page).click()
    await expect(calculandoEnSheet(page)).not.toBeVisible()
  })
})
