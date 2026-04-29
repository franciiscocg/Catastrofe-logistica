import bcrypt from 'bcryptjs'
import { RolUsuario } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import type { LoginInput, RegisterInput } from './auth.schema.js'

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 })
}

export async function loginUser({ email, password }: LoginInput) {
  const user = await prisma.usuario.findUnique({ where: { email } })
  if (!user) throw new Error('Credenciales incorrectas')

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) throw new Error('Credenciales incorrectas')

  if (!user.activo) throw new Error('Cuenta desactivada')

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
  if (exists) throw badRequest('Este email ya está registrado')

  if (input.dni) {
    const dniExists = await prisma.usuario.findUnique({ where: { dni: input.dni } })
    if (dniExists) throw badRequest('Este DNI/NIE ya está registrado')
  }

  const hashed = await bcrypt.hash(input.password, 12)
  const roles = input.role === 'voluntario'
    ? [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO]
    : [RolUsuario.CIUDADANO]

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.usuario.create({
      data: {
        email: input.email,
        password: hashed,
        nombre: input.nombre,
        apellidos: input.apellidos,
        telefono: input.telefono,
        dni: input.dni,
        roles,
      },
      select: { id: true, email: true, nombre: true, apellidos: true, telefono: true, roles: true },
    })

    if (input.role === 'voluntario') {
      await tx.voluntario.create({
        data: {
          usuarioId: created.id,
        },
      })
    }

    return created
  })

  return user
}
