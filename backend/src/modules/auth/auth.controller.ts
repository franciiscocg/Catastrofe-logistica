import type { FastifyRequest, FastifyReply } from 'fastify'
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
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
import { ACCESS_TOKEN_EXPIRES_IN, ACCESS_TOKEN_TTL_SECONDS } from '../../lib/security.js'
import { sendAccountVerificationEmail, sendPasswordResetEmail } from '../../lib/email.js'

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
  return reply.send({ user, refreshToken, ...tokenPayload })
}

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const input = registerSchema.parse(request.body)
  const { user, puesto, solicitud, verificationToken } = await registerUser(input)

  await sendAccountVerificationEmail({
    to: user.email,
    nombre: user.nombre,
    token: verificationToken,
  })

  if (!user.emailVerified) {
    const devVerification = process.env.NODE_ENV === 'production' ? {} : { verificationToken }
    return reply.status(201).send({
      user,
      puesto,
      solicitud,
      requiresEmailVerification: true,
      ...devVerification,
    })
  }

  const refreshToken = await issueRefreshToken(user.id)
  const tokenPayload = await signAccessToken(reply, user)

  const devVerification = process.env.NODE_ENV === 'production' ? {} : { verificationToken }
  return reply.status(201).send({ user, puesto, solicitud, refreshToken, ...tokenPayload, ...devVerification })
}

export async function refresh(request: FastifyRequest, reply: FastifyReply) {
  const input = refreshSchema.parse(request.body)
  const { user, refreshToken } = await rotateRefreshToken(input.refreshToken)
  const tokenPayload = await signAccessToken(reply, user)
  return reply.send({ user, refreshToken, ...tokenPayload })
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const input = logoutSchema.parse(request.body ?? {})
  await revokeRefreshToken(input.refreshToken)
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

  const devVerification = process.env.NODE_ENV === 'production' || !result.verificationToken ? {} : { verificationToken: result.verificationToken }
  return reply.send({ sent: true, ...devVerification })
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

  const devReset = process.env.NODE_ENV === 'production' || !result.resetToken ? {} : { resetToken: result.resetToken }
  return reply.send({ sent: true, ...devReset })
}

export async function reset(request: FastifyRequest, reply: FastifyReply) {
  const input = resetPasswordSchema.parse(request.body)
  return reply.send(await resetPassword(input))
}

export async function me(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ user: request.user })
}
