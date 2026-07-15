import { test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const SCREENSHOT_DIR = path.resolve(process.cwd(), '..', 'fotos-ui')

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

test.describe('UI Screenshot Flow', () => {
  test.setTimeout(180000)

  test('Navigate and capture screenshots', async ({ page, context }) => {
    // Log browser messages for debugging
    page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`))
    page.on('pageerror', err => console.log(`[Browser Error] ${err.stack || err.message}`))

    // Grant geolocation permissions to avoid the "Ubicación desactivada" banner
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 39.4254, longitude: -0.4178 })

    // 1. Static Auth Pages
    console.log('Capturing static auth pages...')
    
    await page.goto('/auth/login')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_login.png'), fullPage: true })

    await page.goto('/auth/register')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_registro_ciudadano_voluntario.png'), fullPage: true })

    await page.goto('/auth/registro-puesto')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_registro_puesto_emergencia.png'), fullPage: true })

    await page.goto('/auth/request-reset')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_recuperar_contrasena.png'), fullPage: true })

    await page.goto('/verificar')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_verificacion_qr.png'), fullPage: true })

    // Helper login function
    const login = async (email: string) => {
      await page.goto('/auth/login')
      await page.waitForLoadState('networkidle')
      await page.locator('input[autoComplete="username"], input[type="text"]').first().fill(email)
      await page.fill('input[type="password"]', 'Demo12345')
      
      await page.click('button[type="submit"]')
      await page.waitForTimeout(2000) // Wait a brief moment for any redirects or API calls
      await page.waitForLoadState('networkidle')
      
      console.log(`[Login] Tried logging in as ${email}. Landing URL: ${page.url()}`)
    }

    // Helper logout function
    const logout = async () => {
      await page.evaluate(async () => {
        localStorage.clear()
        sessionStorage.clear()
        if (window.indexedDB && window.indexedDB.databases) {
          try {
            const dbs = await window.indexedDB.databases()
            for (const dbInfo of dbs) {
              if (dbInfo.name) {
                window.indexedDB.deleteDatabase(dbInfo.name)
              }
            }
          } catch (e) {
            console.error('Error deleting indexedDB:', e)
          }
        }
      })
      await context.clearCookies()
      await page.goto('/')
      await page.waitForLoadState('networkidle')
    }

    // 2. Ciudadano Flow
    console.log('Capturing Ciudadano flow...')
    await login('ciudadano@demo.local')
    
    // Check if role selection screen is visible
    const selectionHeader = page.locator('h2:has-text("¿Cómo quieres participar?")')
    if (await selectionHeader.isVisible()) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_seleccion_rol.png'), fullPage: true })
      await page.click('button:has-text("Ciudadano")')
      await page.waitForLoadState('networkidle')
    }

    // Dashboard Ciudadano (Inicio)
    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000) // Wait for render
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_ciudadano_inicio.png'), fullPage: true })

    // View Map
    const verMapaBtn = page.locator('button:has-text("Ver mapa")')
    if (await verMapaBtn.count() > 0) {
      await verMapaBtn.first().click()
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2000)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_ciudadano_mapa.png'), fullPage: true })
      
      // Go back to dashboard by navigating back to /ciudadano
      await page.goto('/ciudadano')
      await page.waitForLoadState('networkidle')
    }

    // Find Search product flow
    const searchBtn = page.locator('button:has-text("Buscar producto")')
    if (await searchBtn.count() > 0) {
      await searchBtn.first().click()
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2000)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_ciudadano_busqueda_productos.png'), fullPage: true })
      
      const searchInput = page.locator('input[type="search"], input[placeholder*="Buscar"], input[placeholder*="producto"]')
      if (await searchInput.isVisible()) {
        await searchInput.fill('agua')
        await page.waitForTimeout(2000)
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_ciudadano_busqueda_agua.png'), fullPage: true })
      }
      
      // Go back to dashboard
      await page.goto('/ciudadano')
      await page.waitForLoadState('networkidle')
    }

    // Reportar Incidencia
    const reportBtn = page.locator('button:has-text("Reportar incidencia")')
    if (await reportBtn.count() > 0) {
      await reportBtn.first().click()
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2000)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_ciudadano_reportar_incidencia.png'), fullPage: true })
      
      // Go back to dashboard
      await page.goto('/ciudadano')
      await page.waitForLoadState('networkidle')
    }

    // Citizen profile page
    await page.goto('/perfil')
    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_perfil_usuario.png'), fullPage: true })

    await logout()

    // 3. Voluntario Flow
    console.log('Capturing Voluntario flow...')
    // Intercept incidencias API to return empty list for routing calculations Detour checks
    await page.route('**/api/incidencias', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ incidencias: [] })
      })
    })
    await login('voluntario@demo.local')
    if (await selectionHeader.isVisible()) {
      await page.click('button:has-text("Voluntario")')
      await page.waitForLoadState('networkidle')
    }
    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000)

    // Cancel active donation to return to selector cards
    const cancelBtn = page.locator('button:has-text("Cancelar Donación")')
    if (await cancelBtn.count() > 0) {
      console.log('[Voluntario] Found active donation, canceling to return to selector cards...')
      page.once('dialog', async dialog => {
        await dialog.accept()
      })
      await cancelBtn.first().click()
      await page.waitForTimeout(2000)
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_voluntario_dashboard.png'), fullPage: true })

    // Card 1: Hacer una donación - Complete wizard flow
    const donarCard = page.locator('button:has-text("Hacer una donación")')
    if (await donarCard.count() > 0) {
      await donarCard.first().click()
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2000)
      
      // Step 1: Selección de productos
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_voluntario_donar_01_productos.png'), fullPage: true })
      
      // Click the first product button
      const productBtn = page.locator('button:has(p)').first()
      await productBtn.click()
      await page.waitForTimeout(1000)
      
      // Click "Continuar" to go to Step 2
      await page.click('button:has-text("Continuar")')
      await page.waitForTimeout(1500)
      
      // Step 2: Ingresar cantidades
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_voluntario_donar_02_cantidades.png'), fullPage: true })
      
      const qtyInput = page.locator('input[placeholder="Cantidad"]').first()
      if (await qtyInput.isVisible()) {
        await qtyInput.fill('5')
        await page.waitForTimeout(1000)
      }
      
      // Click "Calcular Ruta Óptima" to go to Step 3
      await page.click('button:has-text("Calcular Ruta Óptima")')
      await page.waitForTimeout(4000) // Wait for OSRM routing and map load
      
      // Step 3: Propuestas de rutas
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_voluntario_donar_03_rutas.png'), fullPage: true })
      
      // Click "Iniciar Ruta e Indicaciones" to go to Step 4
      await page.click('button:has-text("Iniciar Ruta e Indicaciones")')
      await page.waitForTimeout(4000) // Wait for map navigation leg
      
      // Step 4: Navegación guiada
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_voluntario_donar_04_navegacion.png'), fullPage: true })
      
      // Click "He llegado al Puesto" to go to Step 5
      await page.click('button:has-text("He llegado al Puesto")')
      await page.waitForTimeout(2000)
      
      // Step 5: Entrega (QR)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_voluntario_donar_05_entrega.png'), fullPage: true })
      
      // Handle the dialog prompt for manual delivery and the final success alert
      const handleDialogs = async (dialog: any) => {
        console.log(`[Playwright Dialog] Auto-accepting: ${dialog.message()}`)
        await dialog.accept()
      }
      page.on('dialog', handleDialogs)
      
      // Complete manual delivery to clean up status
      await page.click('button:has-text("Ya he entregado el producto")')
      await page.waitForTimeout(3000)
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
      
      page.off('dialog', handleDialogs)
    }

    // Card 2: Ayudar en incidencia
    const incidenciaCard = page.locator('button:has-text("Ayudar en incidencia")')
    if (await incidenciaCard.count() > 0) {
      await incidenciaCard.first().click()
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2000)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_voluntario_accion_incidencia.png'), fullPage: true })
      
      const volverBtn = page.locator('button:has-text("Volver")')
      if (await volverBtn.count() > 0) {
        await volverBtn.first().click()
        await page.waitForTimeout(1000)
      }
    }

    // Card 3: Ayudar en puesto
    const puestoCard = page.locator('button:has-text("Ayudar en puesto")')
    if (await puestoCard.count() > 0) {
      await puestoCard.first().click()
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2000)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_voluntario_accion_puesto.png'), fullPage: true })
      
      const volverBtn = page.locator('button:has-text("Volver")')
      if (await volverBtn.count() > 0) {
        await volverBtn.first().click()
        await page.waitForTimeout(1000)
      }
    }

    await page.unroute('**/api/incidencias')
    await logout()

    // 4. Puesto Emergencia Flow
    console.log('Capturing Puesto Emergencia flow...')
    await login('puesto.norte@demo.local')
    if (await selectionHeader.isVisible()) {
      await page.click('button:has-text("Puesto de Emergencia")')
      await page.waitForLoadState('networkidle')
    }
    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_puesto_dashboard.png'), fullPage: true })

    // Sub-views of Puesto (Sheets)
    // Nuevo Producto
    const nuevoProdBtn = page.locator('button:has-text("Nuevo producto")')
    if (await nuevoProdBtn.count() > 0) {
      await nuevoProdBtn.first().click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_puesto_sheet_nuevo_producto.png'), fullPage: true })
      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1500)
    }

    // Voluntarios
    const voluntariosBtn = page.locator('button:has-text("Voluntarios")')
    if (await voluntariosBtn.count() > 0) {
      await voluntariosBtn.first().click()
      // Wait for spinner inside sheet to disappear
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2000)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_puesto_sheet_voluntarios.png'), fullPage: true })
      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1500)
    }

    // Historial
    const historialBtn = page.locator('button:has-text("Historial")')
    if (await historialBtn.count() > 0) {
      await historialBtn.first().click()
      // Wait for modal title to ensure it opened
      await page.locator('h2:has-text("Movimientos de inventario")').waitFor({ state: 'visible', timeout: 10000 })
      // Wait for the seeded movements to render (at least "Agua embotellada" should be visible)
      await page.locator('p:has-text("Agua embotellada")').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1000)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_puesto_sheet_historial.png'), fullPage: true })
      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1500)
    }

    // Escanear QR
    const qrBtn = page.locator('button:has-text("Escanear QR")')
    if (await qrBtn.count() > 0) {
      await qrBtn.first().click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_puesto_sheet_qr.png'), fullPage: true })
      const closeQr = page.locator('button[aria-label="Cerrar escaner"]')
      if (await closeQr.count() > 0) {
        await closeQr.click()
        await page.waitForTimeout(1000)
      }
    }

    await logout()

    // 5. Coordinador Flow
    console.log('Capturing Coordinador flow...')
    await login('coordinador@demo.local')
    if (await selectionHeader.isVisible()) {
      await page.click('button:has-text("Coordinador")')
      await page.waitForLoadState('networkidle')
    }
    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_coordinador_dashboard.png'), fullPage: true })

    // Click around coordinator tabs if they exist
    const tabs = ['Puestos', 'Incidencias', 'Usuarios', 'Resumen']
    for (const tab of tabs) {
      const tabBtn = page.locator(`button:has-text("${tab}"), a:has-text("${tab}")`)
      if (await tabBtn.count() > 0) {
        await tabBtn.first().click()
        await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
        await page.waitForTimeout(2000)
        const tabName = tab.toLowerCase().replace(/\s+/g, '_')
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `14_coordinador_tab_${tabName}.png`), fullPage: true })
      }
    }
    await logout()

    console.log('All screenshots captured successfully!')
  })
})
