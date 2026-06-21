import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Role, type User } from '../../../frontend/src/types/auth.types'

const user: User = {
  id: 'user-1',
  email: 'maria@example.com',
  nombre: 'Maria',
  apellidos: 'Garcia',
  roles: ['CIUDADANO'],
}

describe('auth store persistente', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('no escribe tokens ni datos de usuario al persistir una sesión', async () => {
    const { useAuthStore } = await import('../../../frontend/src/store/auth.store')

    useAuthStore.getState().login(user, 'access-token', 'puesto-1', '2030-01-01T00:00:00.000Z')

    const persisted = localStorage.getItem('catlogistica-auth') ?? ''
    expect(persisted).not.toContain('access-token')
    expect(persisted).not.toContain('refreshToken')
    expect(persisted).not.toContain('maria@example.com')
    expect(persisted).toContain('puesto-1')
  })

  it('elimina tokens guardados por versiones anteriores al hidratarse', async () => {
    localStorage.setItem('catlogistica-auth', JSON.stringify({
      state: {
        user,
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        selectedRole: Role.CIUDADANO,
        puestoId: 'puesto-1',
      },
      version: 0,
    }))

    const { useAuthStore } = await import('../../../frontend/src/store/auth.store')

    expect(useAuthStore.getState().accessToken).toBeNull()
    const migrated = localStorage.getItem('catlogistica-auth') ?? ''
    expect(migrated).not.toContain('legacy-access-token')
    expect(migrated).not.toContain('legacy-refresh-token')
    expect(migrated).toContain(Role.CIUDADANO)
  })
})
