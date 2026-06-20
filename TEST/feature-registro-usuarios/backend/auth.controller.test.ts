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
  requestAccountVerification: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  verifyAccount: vi.fn(),
}))

vi.mock('../../../backend/src/lib/email.js', () => ({
  sendAccountVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
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

describe('auth.controller cookies de sesión', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('entrega el refresh token solo mediante cookie HttpOnly al iniciar sesión', async () => {
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
    expect(result).toMatchObject({ user, accessToken: 'access-token' })
    expect(result).not.toHaveProperty('refreshToken')
  })

  it('rota la cookie HttpOnly sin exponer el nuevo token en la respuesta', async () => {
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
    expect(result).not.toHaveProperty('refreshToken')
  })

  it('revoca y borra la cookie al cerrar sesión', async () => {
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
})
