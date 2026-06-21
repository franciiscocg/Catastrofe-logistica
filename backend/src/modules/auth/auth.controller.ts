import type { FastifyRequest, FastifyReply } from 'fastify'
import {
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
} from './auth.schema.js'
import {
  issueRefreshToken,
  loginUser,
  registerUser,
  regenerateRecoveryCode,
  requestPasswordReset,
  revokeRefreshToken,
  rotateRefreshToken,
} from './auth.service.js'
import { ACCESS_TOKEN_EXPIRES_IN, ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS } from '../../lib/security.js'

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
  throw Object.assign(new Error('Sesión expirada'), { statusCode: 401 })
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
  const { user, recoveryCode } = await registerUser(input)

  const refreshToken = await issueRefreshToken(user.id)
  const tokenPayload = await signAccessToken(reply, user)
  setRefreshCookie(reply, refreshToken)

  return reply.status(201).send({ user, recoveryCode, ...tokenPayload })
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

export async function requestReset(request: FastifyRequest, reply: FastifyReply) {
  const input = requestPasswordResetSchema.parse(request.body)
  return reply.send(await requestPasswordReset(input))
}

export async function generateRecoveryCode(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as { id: string }).id
  return reply.send(await regenerateRecoveryCode(userId))
}

export async function me(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ user: request.user })
}
