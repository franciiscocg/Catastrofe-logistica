import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma.js'
import type { LoginInput, RegisterInput } from './auth.schema.js'

export async function loginUser({ email, password }: LoginInput) {
  const user = await prisma.usuario.findUnique({ where: { email } })
  if (!user) throw Object.assign(new Error('Credenciales incorrectas'), { statusCode: 401 })

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) throw Object.assign(new Error('Credenciales incorrectas'), { statusCode: 401 })

  if (!user.activo) throw Object.assign(new Error('Cuenta desactivada'), { statusCode: 403 })

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
  if (exists) throw Object.assign(new Error('Este email ya está registrado'), { statusCode: 409 })

  if (input.dni) {
    const dniExists = await prisma.usuario.findUnique({ where: { dni: input.dni } })
    if (dniExists) throw Object.assign(new Error('Ya existe una cuenta con ese DNI/NIE'), { statusCode: 409 })
  }

  const hashed = await bcrypt.hash(input.password, 12)
  const esPuesto = input.roles?.includes('PUESTO_EMERGENCIA') ?? false

  const user = await prisma.usuario.create({
    data: {
      email:     input.email,
      password:  hashed,
      nombre:    input.nombre,
      apellidos: input.apellidos,
      telefono:  input.telefono,
      dni:       input.dni,
      roles:     esPuesto ? ['PUESTO_EMERGENCIA'] : ['CIUDADANO'],
      activo:    true,
    },
    select: { id: true, email: true, nombre: true, apellidos: true, roles: true },
  })

  let puesto = null

  if (esPuesto && input.puesto) {
    // Buscar cualquier catástrofe (activa primero, si no la más reciente)
    const catastrofe = await prisma.catastrofe.findFirst({
      orderBy: [{ activa: 'desc' }, { createdAt: 'desc' }],
    })

    if (!catastrofe) {
      throw Object.assign(
        new Error('No hay ninguna catástrofe registrada en el sistema. Contacta con un coordinador.'),
        { statusCode: 422 },
      )
    }

    puesto = await prisma.puestoEmergencia.create({
      data: {
        nombre:       input.puesto.nombre,
        tipo:         input.puesto.tipo,
        direccion:    input.puesto.direccion,
        descripcion:  input.puesto.descripcion,
        latitud:      input.puesto.latitud,
        longitud:     input.puesto.longitud,
        activo:       true,
        catastrofeId: catastrofe.id,
        adminId:      user.id,
      },
      select: { id: true, nombre: true, direccion: true, tipo: true },
    })
  }

  return { user, puesto }
}
