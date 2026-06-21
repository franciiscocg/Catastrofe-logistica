import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loginUser: vi.fn(),
  issueRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
}))

vi.mock('../../../backend/src/modules/auth/auth.service.js', () => ({
  loginUser: mocks.loginUser,
  issueRefreshToken: mocks.issueRefreshToken,
  rotateRefreshToken: mocks.rotateRefreshToken,
  revokeRefreshToken: mocks.revokeRefreshToken,
  registerUser: vi.fn(),
  requestPasswordReset: vi.fn(),
  regenerateRecoveryCode: vi.fn(),
}))

import { login, logout, refresh } from '../../../backend/src/modules/auth/auth.controller.js'

const user = {
  id: 'user-1',
  email: 'maria@example.com',
  nombre: 'Maria',
  apellidos: 'Garcia',
  roles: ['CIUDADANO'],
}

function makeReply() {
  const reply = {
    jwtSign: vi.fn().mockResolvedValue('access-token'),
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
    send: vi.fn(),
    status: vi.fn(),
  }
  reply.status.mockReturnValue(reply)
  reply.send.mockImplementation((payload) => payload)
  return reply
}

describe('auth.controller sesión (cookie + token en cuerpo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('al iniciar sesión fija la cookie HttpOnly y devuelve el refresh token en el cuerpo', async () => {
    mocks.loginUser.mockResolvedValue(user)
    mocks.issueRefreshToken.mockResolvedValue('refresh-token-login')
    const reply = makeReply()

    const result = await login(
      { body: { identifier: user.email, password: 'Password123' } } as never,
      reply as never,
    )

    expect(reply.setCookie).toHaveBeenCalledWith(
      'catlogistica_refresh',
      'refresh-token-login',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/api/auth',
      }),
    )
    // El cuerpo lleva el token para clientes cross-site (la cookie seria de terceros).
    expect(result).toMatchObject({ user, accessToken: 'access-token', refreshToken: 'refresh-token-login' })
  })

  it('rota la cookie HttpOnly y devuelve el nuevo token en el cuerpo', async () => {
    mocks.rotateRefreshToken.mockResolvedValue({ user, refreshToken: 'refresh-token-next' })
    const reply = makeReply()

    const result = await refresh(
      { cookies: { catlogistica_refresh: 'refresh-token-current' } } as never,
      reply as never,
    )

    expect(mocks.rotateRefreshToken).toHaveBeenCalledWith('refresh-token-current')
    expect(reply.setCookie).toHaveBeenCalledWith(
      'catlogistica_refresh',
      'refresh-token-next',
      expect.objectContaining({ httpOnly: true }),
    )
    expect(result).toMatchObject({ refreshToken: 'refresh-token-next' })
  })

  it('al refrescar prioriza el refresh token del cuerpo sobre la cookie', async () => {
    mocks.rotateRefreshToken.mockResolvedValue({ user, refreshToken: 'refresh-token-next' })
    const reply = makeReply()

    await refresh(
      {
        body: { refreshToken: 'refresh-token-body' },
        cookies: { catlogistica_refresh: 'refresh-token-cookie' },
      } as never,
      reply as never,
    )

    expect(mocks.rotateRefreshToken).toHaveBeenCalledWith('refresh-token-body')
  })

  it('revoca y borra la cookie al cerrar sesión (token desde la cookie)', async () => {
    const reply = makeReply()

    await logout(
      { cookies: { catlogistica_refresh: 'refresh-token-current' } } as never,
      reply as never,
    )

    expect(mocks.revokeRefreshToken).toHaveBeenCalledWith('refresh-token-current')
    expect(reply.clearCookie).toHaveBeenCalledWith(
      'catlogistica_refresh',
      expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
    )
    expect(reply.status).toHaveBeenCalledWith(204)
  })

  it('al cerrar sesión revoca el refresh token recibido en el cuerpo', async () => {
    const reply = makeReply()

    await logout(
      { body: { refreshToken: 'refresh-token-body' }, cookies: {} } as never,
      reply as never,
    )

    expect(mocks.revokeRefreshToken).toHaveBeenCalledWith('refresh-token-body')
    expect(reply.status).toHaveBeenCalledWith(204)
  })
})
