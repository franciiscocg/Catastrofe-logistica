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

  if (input.dni) {
    const dniExists = await prisma.usuario.findUnique({ where: { dni: input.dni } })
    if (dniExists) throw new Error('Ya existe una cuenta con ese DNI/NIE')
  }

  const hashed = await bcrypt.hash(input.password, 12)

  // Determinar roles
  const roles = input.roles?.includes('PUESTO_EMERGENCIA')
    ? (['PUESTO_EMERGENCIA'] as const)
    : (['CIUDADANO'] as const)

  const user = await prisma.usuario.create({
    data: {
      email: input.email,
      password: hashed,
      nombre: input.nombre,
      apellidos: input.apellidos,
      telefono: input.telefono,
      dni: input.dni,
      roles,
      activo: true,
    },
    select: { id: true, email: true, nombre: true, apellidos: true, roles: true },
  })

  // Si viene con datos de puesto, crear el puesto asociado (pendiente de activación)
  if (input.puesto && input.roles?.includes('PUESTO_EMERGENCIA')) {
    // Buscar la catástrofe activa más cercana para asociar el puesto
    const catastrofe = await prisma.catastrofe.findFirst({
      where: { activa: true },
      orderBy: { createdAt: 'desc' },
    })

    if (catastrofe) {
      await prisma.puestoEmergencia.create({
        data: {
          nombre:      input.puesto.nombre,
          tipo:        input.puesto.tipo,
          direccion:   input.puesto.direccion,
          descripcion: input.puesto.descripcion,
          latitud:     input.puesto.latitud,
          longitud:    input.puesto.longitud,
          activo:      true,
          catastrofeId: catastrofe.id,
          adminId:     user.id,
        },
      })
    }
  }

  return user
}
