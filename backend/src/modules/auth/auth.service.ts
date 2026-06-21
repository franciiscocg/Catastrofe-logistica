import bcrypt from 'bcryptjs'
import { RolUsuario } from '@prisma/client'
import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '../../lib/prisma.js'
import { REFRESH_TOKEN_TTL_DAYS } from '../../lib/security.js'
import type { LoginInput, RegisterInput, RequestPasswordResetInput } from './auth.schema.js'

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
  const normalizedIdentifier = identifier.trim()
  const isEmail = emailRegex.test(normalizedIdentifier)
  const user = isEmail
    ? await prisma.usuario.findUnique({ where: { email: normalizedIdentifier.toLowerCase() } })
    : await prisma.usuario.findUnique({ where: { dni: normalizedIdentifier.toUpperCase() } })

  if (!user) throw appError('Credenciales incorrectas', 401)

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) throw appError('Credenciales incorrectas', 401)

  if (!user.activo) throw appError('Cuenta desactivada', 403)
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
  const email = input.email.trim().toLowerCase()
  const exists = await prisma.usuario.findUnique({ where: { email } })
  if (exists) throw badRequest('Este email ya está registrado')

  const dniExists = await prisma.usuario.findUnique({ where: { dni: input.dni.toUpperCase() } })
  if (dniExists) throw badRequest('Este DNI/NIE ya está registrado')

  const hashed = await bcrypt.hash(input.password, 12)
  const roles = [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO]

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.usuario.create({
      data: {
        email,
        password: hashed,
        nombre: input.nombre,
        apellidos: input.apellidos,
        telefono: input.telefono,
        dni: input.dni.toUpperCase(),
        roles,
        activo: true,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true, nombre: true, apellidos: true, telefono: true, roles: true, emailVerified: true },
    })

    await tx.voluntario.create({
      data: { usuarioId: created.id },
    })
    return created
  })

  return { user }
}

export async function requestPasswordReset({ email, dni, password }: RequestPasswordResetInput) {
  const user = await prisma.usuario.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      dni: dni.trim().toUpperCase(),
      activo: true,
    },
  })
  if (!user) throw badRequest('El correo y el DNI/NIE no coinciden con ninguna cuenta activa')

  const hashed = await bcrypt.hash(password, 12)
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: user.id },
      data: { password: hashed, emailVerified: true, emailVerifiedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { usuarioId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])

  return { ok: true }
}
