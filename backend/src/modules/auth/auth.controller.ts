import type { FastifyRequest, FastifyReply } from 'fastify'
import {
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  verifyAccountSchema,
} from './auth.schema.js'
import {
  issueRefreshToken,
  loginUser,
  requestAccountVerification,
  registerUser,
  requestPasswordReset,
  resetPassword,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyAccount,
} from './auth.service.js'
import { ACCESS_TOKEN_EXPIRES_IN, ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS } from '../../lib/security.js'
import { sendAccountVerificationEmail, sendPasswordResetEmail } from '../../lib/email.js'

const REFRESH_COOKIE_NAME = 'catlogistica_refresh'
const REFRESH_COOKIE_PATH = '/api/auth'
const COOKIE_SAME_SITE = (process.env.COOKIE_SAME_SITE ?? (process.env.NODE_ENV === 'production' ? 'none' : 'lax')) as 'lax' | 'strict' | 'none'

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: COOKIE_SAME_SITE,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  }
}

function setRefreshCookie(reply: FastifyReply, refreshToken: string) {
  reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions())
}

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions())
}

function readRefreshCookie(request: FastifyRequest, reply: FastifyReply) {
  const refreshToken = request.cookies[REFRESH_COOKIE_NAME]
  if (refreshToken) return refreshToken

  clearRefreshCookie(reply)
  throw Object.assign(new Error('Sesion expirada'), { statusCode: 401 })
}

async function signAccessToken(reply: FastifyReply, user: { id: string; email: string; roles: string[] }) {
  const accessToken = await reply.jwtSign(
    { sub: user.id, id: user.id, email: user.email, roles: user.roles },
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
  )
  return {
    accessToken,
    accessTokenExpiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
  }
}

export async function login(request: FastifyRequest, reply: FastifyReply) {
  const input = loginSchema.parse(request.body)
  const user = await loginUser(input)
  const refreshToken = await issueRefreshToken(user.id)
  const tokenPayload = await signAccessToken(reply, user)
  setRefreshCookie(reply, refreshToken)
  return reply.send({ user, ...tokenPayload })
}

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const input = registerSchema.parse(request.body)
  const { user, verificationToken } = await registerUser(input)

  if (!user.emailVerified) {
    await sendAccountVerificationEmail({
      to: user.email,
      nombre: user.nombre,
      token: verificationToken,
    })

    return reply.status(201).send({
      user,
      requiresEmailVerification: true,
    })
  }

  const refreshToken = await issueRefreshToken(user.id)
  const tokenPayload = await signAccessToken(reply, user)
  setRefreshCookie(reply, refreshToken)

  return reply.status(201).send({ user, ...tokenPayload })
}

export async function refresh(request: FastifyRequest, reply: FastifyReply) {
  const currentRefreshToken = readRefreshCookie(request, reply)
  try {
    const { user, refreshToken } = await rotateRefreshToken(currentRefreshToken)
    const tokenPayload = await signAccessToken(reply, user)
    setRefreshCookie(reply, refreshToken)
    return reply.send({ user, ...tokenPayload })
  } catch (error) {
    clearRefreshCookie(reply)
    throw error
  }
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  await revokeRefreshToken(request.cookies[REFRESH_COOKIE_NAME])
  clearRefreshCookie(reply)
  return reply.status(204).send()
}

export async function verify(request: FastifyRequest, reply: FastifyReply) {
  const input = verifyAccountSchema.parse(request.body)
  const user = await verifyAccount(input.token)
  return reply.send({ user })
}

export async function resendVerification(request: FastifyRequest, reply: FastifyReply) {
  const input = resendVerificationSchema.parse(request.body)
  const result = await requestAccountVerification(input)

  if (result.verificationToken && result.user) {
    await sendAccountVerificationEmail({
      to: result.user.email,
      nombre: result.user.nombre,
      token: result.verificationToken,
    })
  }

  return reply.send({ sent: true })
}

export async function requestReset(request: FastifyRequest, reply: FastifyReply) {
  const input = requestPasswordResetSchema.parse(request.body)
  const result = await requestPasswordReset(input)

  if (result.resetToken && result.user) {
    await sendPasswordResetEmail({
      to: result.user.email,
      nombre: result.user.nombre,
      token: result.resetToken,
    })
  }

  return reply.send({ sent: true })
}

export async function reset(request: FastifyRequest, reply: FastifyReply) {
  const input = resetPasswordSchema.parse(request.body)
  return reply.send(await resetPassword(input))
}

export async function me(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ user: request.user })
}
