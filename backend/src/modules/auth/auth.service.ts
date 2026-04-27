import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma.js'
import type { LoginInput, RegisterInput } from './auth.schema.js'

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
    roles: user.roles,
  }
}

export async function registerUser(input: RegisterInput) {
  const exists = await prisma.usuario.findUnique({ where: { email: input.email } })
  if (exists) throw new Error('Este email ya está registrado')

  const hashed = await bcrypt.hash(input.password, 12)

  const user = await prisma.usuario.create({
    data: {
      email: input.email,
      password: hashed,
      nombre: input.nombre,
      apellidos: input.apellidos,
      telefono: input.telefono,
      roles: ['CIUDADANO'],
    },
    select: { id: true, email: true, nombre: true, apellidos: true, roles: true },
  })

  return user
}
