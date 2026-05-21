import bcrypt from 'bcryptjs'
import { RolUsuario } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import type { LoginInput, RegisterInput } from './auth.schema.js'

function appError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode })
}

function badRequest(message: string) {
  return appError(message, 400)
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function loginUser({ identifier, password }: LoginInput) {
  const isEmail = emailRegex.test(identifier)
  const user = isEmail
    ? await prisma.usuario.findUnique({ where: { email: identifier } })
    : await prisma.usuario.findUnique({ where: { dni: identifier.toUpperCase() } })

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

  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    apellidos: user.apellidos,
    telefono: user.telefono,
    roles: user.roles,
  }
}

export async function registerUser(input: RegisterInput) {
  const exists = await prisma.usuario.findUnique({ where: { email: input.email } })
  if (exists) throw badRequest('Este email ya esta registrado')

  const dniExists = await prisma.usuario.findUnique({ where: { dni: input.dni.toUpperCase() } })
  if (dniExists) throw badRequest('Este DNI/NIE ya esta registrado')

  const hashed = await bcrypt.hash(input.password, 12)
  const esPuesto = Boolean(input.puesto)
  const roles = esPuesto
    ? [RolUsuario.PUESTO_EMERGENCIA]
    : [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO]

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
      },
      select: { id: true, email: true, nombre: true, apellidos: true, telefono: true, roles: true },
    })

    let puesto = null
    let solicitud = null

    if (esPuesto && input.puesto) {
      solicitud = await tx.solicitudPuesto.create({
        data: {
          usuarioId: created.id,
          nombre: input.puesto.nombre,
          tipo: input.puesto.tipo,
          direccion: input.puesto.direccion,
          descripcion: input.puesto.descripcion,
          latitud: input.puesto.latitud,
          longitud: input.puesto.longitud,
        },
        select: { id: true, nombre: true, estado: true },
      })
    }

    if (!esPuesto) {
      await tx.voluntario.create({
        data: { usuarioId: created.id },
      })
    }

    return { user: created, puesto, solicitud }
  })

  return result
}
