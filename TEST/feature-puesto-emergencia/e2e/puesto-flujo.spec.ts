import { test, expect } from '@playwright/test'

test.describe('Acceso como puesto de emergencia', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('la seleccion de rol muestra Puesto de Emergencia', async ({ page }) => {
    await expect(page.getByText('Puesto de Emergencia')).toBeVisible()
    await expect(page.getByText(/Gestiono un punto de distribuci.n/)).toBeVisible()
  })

  test('pulsar Puesto de Emergencia redirige a login con role=puesto', async ({ page }) => {
    await page.getByRole('button', { name: /Acceder como Puesto de Emergencia/i }).click()
    await expect(page).toHaveURL(/\/auth\/login\?role=puesto/)
    await expect(page.getByText('Para acceder como')).toBeVisible()
    await expect(page.getByText('Puesto de emergencia')).toBeVisible()
  })

  test('desde login se abre el registro especifico de puesto', async ({ page }) => {
    await page.getByRole('button', { name: /Acceder como Puesto de Emergencia/i }).click()
    await page.getByText(/Reg.strate/).click()

    await expect(page).toHaveURL(/\/auth\/register\?role=puesto/)
    await expect(page.getByText('Registrar puesto de emergencia')).toBeVisible()
    await expect(page.getByText('Datos del responsable')).toBeVisible()
  })
})
