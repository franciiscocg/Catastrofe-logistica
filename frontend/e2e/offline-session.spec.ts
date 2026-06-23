import { expect, test } from '@playwright/test'

const user = {
  id: 'offline-user',
  email: 'offline@example.com',
  nombre: 'Usuario',
  apellidos: 'Offline',
  roles: ['CIUDADANO', 'VOLUNTARIO'],
}

test('la PWA conserva la sesión y arranca después de recargar sin red', async ({ page, context }) => {
  const offlineSessionExpiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000

  await page.addInitScript(({ persistedUser, expiresAt }) => {
    localStorage.setItem('catlogistica-auth', JSON.stringify({
      state: {
        selectedRole: null,
        puestoId: null,
        user: persistedUser,
        offlineSessionExpiresAt: expiresAt,
      },
      version: 3,
    }))
    localStorage.setItem('catlogistica:refresh-token', 'test-refresh-token')
  }, { persistedUser: user, expiresAt: offlineSessionExpiresAt })

  await page.route('**/api/auth/refresh', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user, accessToken: 'test-access-token', accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString() }),
  }))

  await page.goto('/')
  await expect(page.getByText('¿Cómo quieres participar?')).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false })
  })
  await page.reload()

  await expect(page).not.toHaveURL(/\/auth\/login/)
  await expect(page.getByText('Sin conexión', { exact: false })).toBeVisible()
  await expect(page.getByText('¿Cómo quieres participar?')).toBeVisible()
})
