import { expect, test } from '@playwright/test'

const user = {
  id: 'offline-user',
  email: 'offline@example.com',
  nombre: 'Usuario',
  apellidos: 'Offline',
  roles: ['CIUDADANO', 'VOLUNTARIO'],
}

test('la PWA conserva la sesión y arranca después de recargar sin red', async ({ page, context }) => {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user, accessToken: 'test-access-token', accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString() }),
  }))

  await page.goto('/')
  await expect(page.getByText('¿Cómo quieres participar?')).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)
  await page.reload()

  await expect(page).not.toHaveURL(/\/auth\/login/)
  await expect(page.getByText('Sin conexión', { exact: false })).toBeVisible()
  await expect(page.getByText('¿Cómo quieres participar?')).toBeVisible()
})
