import bcrypt from 'bcryptjs'
import { RolUsuario } from '@prisma/client'
import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '../../lib/prisma.js'
import { EMAIL_VERIFICATION_REQUIRED, REFRESH_TOKEN_TTL_DAYS, RESET_TOKEN_TTL_MINUTES, VERIFY_TOKEN_TTL_HOURS } from '../../lib/security.js'
import {
  firebaseLookupAccount,
  firebaseDeleteCurrentUser,
  firebaseRefreshSession,
  firebaseSessionPayload,
  firebaseSignIn,
  firebaseSignUp,
  sendFirebasePasswordResetEmail,
  sendFirebaseVerificationEmail,
  verifyFirebaseIdToken,
} from '../../lib/firebase-auth.js'
import type { LoginInput, RegisterInput, ResendVerificationInput, RequestPasswordResetInput, ResetPasswordInput } from './auth.schema.js'

function appError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode })
}

function badRequest(message: string) {
  return appError(message, 400)
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function createPlainToken() {
  return randomBytes(32).toString('base64url')
}

function addMs(ms: number) {
  return new Date(Date.now() + ms)
}

export function sanitizeUser(user: {
  id: string
  email: string
  nombre: string
  apellidos: string
  telefono: string | null
  roles: RolUsuario[]
  emailVerified?: boolean
}) {
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    apellidos: user.apellidos,
    telefono: user.telefono,
    roles: user.roles,
    emailVerified: user.emailVerified ?? true,
  }
}

export async function loginUser({ identifier, password }: LoginInput) {
  const isEmail = emailRegex.test(identifier)
  const user = isEmail
    ? await prisma.usuario.findUnique({ where: { email: identifier } })
    : await prisma.usuario.findUnique({ where: { dni: identifier.toUpperCase() } })

  if (!user) throw appError('Credenciales incorrectas', 401)

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) throw appError('Credenciales incorrectas', 401)

  if (!user.activo) throw appError('Cuenta desactivada', 403)
  if (EMAIL_VERIFICATION_REQUIRED && !user.emailVerified) {
    throw appError('Verifica tu cuenta antes de iniciar sesión', 403)
  }

  if (user.roles.includes(RolUsuario.VOLUNTARIO)) {
    await prisma.voluntario.upsert({
      where: { usuarioId: user.id },
      update: {},
      create: { usuarioId: user.id },
    })
  }

  return sanitizeUser(user)
}

export async function issueRefreshToken(usuarioId: string) {
  const refreshToken = createPlainToken()
  await prisma.refreshToken.create({
    data: {
      usuarioId,
      tokenHash: hashToken(refreshToken),
      expiresAt: addMs(REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  })
  return refreshToken
}

export async function rotateRefreshToken(refreshToken: string) {
  const tokenHash = hashToken(refreshToken)
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { usuario: true },
  })

  if (!record || record.revokedAt || record.expiresAt <= new Date() || !record.usuario.activo) {
    throw appError('Sesión expirada', 401)
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  })

  const nextRefreshToken = await issueRefreshToken(record.usuarioId)
  return { user: sanitizeUser(record.usuario), refreshToken: nextRefreshToken }
}

export async function revokeRefreshToken(refreshToken?: string) {
  if (!refreshToken) return
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function registerUser(input: RegisterInput) {
  const exists = await prisma.usuario.findUnique({ where: { email: input.email } })
  if (exists) throw badRequest('Este email ya está registrado')

  const dniExists = await prisma.usuario.findUnique({ where: { dni: input.dni.toUpperCase() } })
  if (dniExists) throw badRequest('Este DNI/NIE ya está registrado')

  const hashed = await bcrypt.hash(input.password, 12)
  const roles = [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO]

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.usuario.create({
      data: {
        email: input.email,
        password: hashed,
        nombre: input.nombre,
        apellidos: input.apellidos,
        telefono: input.telefono,
        dni: input.dni.toUpperCase(),
        roles,
        activo: true,
        emailVerified: !EMAIL_VERIFICATION_REQUIRED,
        emailVerifiedAt: !EMAIL_VERIFICATION_REQUIRED ? new Date() : undefined,
      },
      select: { id: true, email: true, nombre: true, apellidos: true, telefono: true, roles: true, emailVerified: true },
    })

    await tx.voluntario.create({
      data: { usuarioId: created.id },
    })

    const verificationToken = createPlainToken()
    await tx.accountVerificationToken.create({
      data: {
        usuarioId: created.id,
        tokenHash: hashToken(verificationToken),
        expiresAt: addMs(VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000),
      },
    })

    return { user: created, verificationToken }
  })

  return result
}

export async function verifyAccount(token: string) {
  const record = await prisma.accountVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!record || record.usedAt || record.expiresAt <= new Date()) throw badRequest('Token de verificación inválido o caducado')

  const user = await prisma.usuario.update({
    where: { id: record.usuarioId },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  })
  await prisma.accountVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
  return sanitizeUser(user)
}

export async function requestAccountVerification({ identifier }: ResendVerificationInput) {
  const isEmail = emailRegex.test(identifier)
  const user = isEmail
    ? await prisma.usuario.findUnique({ where: { email: identifier } })
    : await prisma.usuario.findUnique({ where: { dni: identifier.toUpperCase() } })

  if (!user || user.emailVerified) return { sent: true }

  const token = createPlainToken()
  await prisma.accountVerificationToken.create({
    data: {
      usuarioId: user.id,
      tokenHash: hashToken(token),
      expiresAt: addMs(VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000),
    },
  })

  return {
    sent: true,
    verificationToken: token,
    user: {
      email: user.email,
      nombre: user.nombre,
    },
  }
}

export async function requestPasswordReset({ identifier }: RequestPasswordResetInput) {
  const isEmail = emailRegex.test(identifier)
  const user = isEmail
    ? await prisma.usuario.findUnique({ where: { email: identifier } })
    : await prisma.usuario.findUnique({ where: { dni: identifier.toUpperCase() } })

  if (!user) return { sent: true }

  const token = createPlainToken()
  await prisma.passwordResetToken.create({
    data: {
      usuarioId: user.id,
      tokenHash: hashToken(token),
      expiresAt: addMs(RESET_TOKEN_TTL_MINUTES * 60 * 1000),
    },
  })

  return {
    sent: true,
    resetToken: token,
    user: {
      email: user.email,
      nombre: user.nombre,
    },
  }
}

export async function resetPassword({ token, password }: ResetPasswordInput) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!record || record.usedAt || record.expiresAt <= new Date()) throw badRequest('Token de recuperación inválido o caducado')

  const hashed = await bcrypt.hash(password, 12)
  await prisma.$transaction([
    prisma.usuario.update({ where: { id: record.usuarioId }, data: { password: hashed } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { usuarioId: record.usuarioId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ])

  return { ok: true }
}

async function findUserByIdentifier(identifier: string) {
  const normalized = identifier.trim()
  return emailRegex.test(normalized)
    ? prisma.usuario.findUnique({ where: { email: normalized.toLowerCase() } })
    : prisma.usuario.findUnique({ where: { dni: normalized.toUpperCase() } })
}

function getFirebaseCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('firebaseCode' in error)) return undefined
  return (error as { firebaseCode?: string }).firebaseCode
}

async function ensureFirebaseIdentityForLegacyUser(user: {
  id: string
  email: string
  password: string
  firebaseUid: string | null
}, password: string) {
  try {
    const session = await firebaseSignIn(user.email, password)
    if (user.firebaseUid !== session.localId) {
      await prisma.usuario.update({ where: { id: user.id }, data: { firebaseUid: session.localId } })
    }
    return session
  } catch (error) {
    const firebaseCode = getFirebaseCode(error)
    if (user.firebaseUid || (firebaseCode !== 'EMAIL_NOT_FOUND' && firebaseCode !== 'INVALID_LOGIN_CREDENTIALS')) {
      throw error
    }
  }

  const validLegacyPassword = await bcrypt.compare(password, user.password)
  if (!validLegacyPassword) throw appError('Credenciales incorrectas', 401)

  const session = await firebaseSignUp(user.email, password)
  await prisma.usuario.update({ where: { id: user.id }, data: { firebaseUid: session.localId } })
  return session
}

export async function registerFirebaseUser(input: RegisterInput) {
  const email = input.email.trim().toLowerCase()
  const exists = await prisma.usuario.findUnique({ where: { email } })
  if (exists) throw badRequest('Este correo electrónico ya está registrado')

  const dni = input.dni.trim().toUpperCase()
  const dniExists = await prisma.usuario.findUnique({ where: { dni } })
  if (dniExists) throw badRequest('Este DNI/NIE ya está registrado')

  const firebaseSession = await firebaseSignUp(email, input.password)
  const hashed = await bcrypt.hash(input.password, 12)
  const roles = [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO]

  let user
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.usuario.create({
        data: {
          email,
          firebaseUid: firebaseSession.localId,
          password: hashed,
          nombre: input.nombre,
          apellidos: input.apellidos,
          telefono: input.telefono,
          dni,
          roles,
          activo: true,
          emailVerified: false,
        },
      })
      await tx.voluntario.create({ data: { usuarioId: created.id } })
      return created
    })
  } catch (error) {
    await firebaseDeleteCurrentUser(firebaseSession.idToken).catch(() => undefined)
    throw error
  }

  let verificationEmailSent = true
  try {
    await sendFirebaseVerificationEmail(firebaseSession.idToken)
  } catch {
    verificationEmailSent = false
  }

  return {
    user: sanitizeUser(user),
    verificationEmailSent,
  }
}

export async function loginFirebaseUser({ identifier, password }: LoginInput) {
  const user = await findUserByIdentifier(identifier)
  if (!user) throw appError('Credenciales incorrectas', 401)
  if (!user.activo) throw appError('Cuenta desactivada', 403)

  const identity = await ensureFirebaseIdentityForLegacyUser(user, password)
  const firebaseAccount = await firebaseLookupAccount(identity.idToken)
  const emailVerified = user.emailVerified || firebaseAccount.emailVerified === true

  if (!emailVerified) {
    await sendFirebaseVerificationEmail(identity.idToken).catch(() => undefined)
    throw appError('Verifica tu cuenta antes de iniciar sesión. Te hemos enviado un nuevo enlace.', 403)
  }

  const updatedUser = firebaseAccount.emailVerified && !user.emailVerified
    ? await prisma.usuario.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifiedAt: new Date(), firebaseUid: firebaseAccount.localId },
    })
    : user

  if (updatedUser.roles.includes(RolUsuario.VOLUNTARIO)) {
    await prisma.voluntario.upsert({
      where: { usuarioId: updatedUser.id },
      update: {},
      create: { usuarioId: updatedUser.id },
    })
  }

  return {
    user: sanitizeUser(updatedUser),
    session: firebaseSessionPayload(identity),
  }
}

export async function refreshFirebaseUser(refreshToken: string) {
  const refreshed = await firebaseRefreshSession(refreshToken)
  const claims = await verifyFirebaseIdToken(refreshed.id_token)
  const user = await prisma.usuario.findFirst({
    where: {
      OR: [
        { firebaseUid: claims.uid },
        ...(claims.email ? [{ email: claims.email.toLowerCase() }] : []),
      ],
    },
  })
  if (!user || !user.activo) throw appError('Sesión expirada', 401)

  if (!user.firebaseUid || (claims.emailVerified && !user.emailVerified)) {
    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        firebaseUid: claims.uid,
        ...(claims.emailVerified && !user.emailVerified
          ? { emailVerified: true, emailVerifiedAt: new Date() }
          : {}),
      },
    })
  }

  return {
    user: sanitizeUser({ ...user, emailVerified: user.emailVerified || claims.emailVerified }),
    session: firebaseSessionPayload({
      idToken: refreshed.id_token,
      refreshToken: refreshed.refresh_token,
      expiresIn: refreshed.expires_in,
    }),
  }
}

export async function resendFirebaseVerification(identifier: string, password: string) {
  const user = await findUserByIdentifier(identifier)
  if (!user || user.emailVerified) return { sent: true }
  const identity = await ensureFirebaseIdentityForLegacyUser(user, password)
  await sendFirebaseVerificationEmail(identity.idToken)
  return { sent: true }
}

export async function requestFirebasePasswordReset(identifier: string) {
  const user = await findUserByIdentifier(identifier)
  if (!user) return { sent: true }

  if (!user.firebaseUid) {
    try {
      const temporaryPassword = `${randomBytes(32).toString('base64url')}aA1!`
      const identity = await firebaseSignUp(user.email, temporaryPassword)
      await prisma.usuario.update({ where: { id: user.id }, data: { firebaseUid: identity.localId } })
    } catch (error) {
      if (getFirebaseCode(error) !== 'EMAIL_EXISTS') throw error
    }
  }

  await sendFirebasePasswordResetEmail(user.email)
  return { sent: true }
}
