import { prisma } from '../../lib/prisma.js'

export async function listTrabajadores(puestoId: string) {
  return prisma.puestoTrabajador.findMany({
    where: { puestoId },
    include: {
      usuario: { select: { id: true, nombre: true, apellidos: true, email: true } },
    },
    orderBy: { addedAt: 'asc' },
  })
}

export async function addTrabajador(puestoId: string, email: string, adminId: string) {
  // Solo el admin del puesto puede añadir trabajadores
  const puesto = await prisma.puestoEmergencia.findUnique({
    where: { id: puestoId },
    select: { id: true, adminId: true },
  })
  if (!puesto) throw Object.assign(new Error('Puesto no encontrado'), { statusCode: 404 })
  if (puesto.adminId !== adminId) throw Object.assign(new Error('Solo el admin puede añadir trabajadores'), { statusCode: 403 })

  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario) throw Object.assign(new Error(`No existe ninguna cuenta con el email ${email}`), { statusCode: 404 })
  if (usuario.id === adminId) throw Object.assign(new Error('El admin ya tiene acceso al puesto'), { statusCode: 409 })

  // Añadir rol PUESTO_EMERGENCIA al usuario si no lo tiene
  if (!usuario.roles.includes('PUESTO_EMERGENCIA')) {
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { roles: { push: 'PUESTO_EMERGENCIA' } },
    })
  }

  return prisma.puestoTrabajador.create({
    data: { puestoId, usuarioId: usuario.id, addedBy: adminId },
    include: {
      usuario: { select: { id: true, nombre: true, apellidos: true, email: true } },
    },
  })
}

export async function removeTrabajador(puestoId: string, userId: string, adminId: string) {
  const puesto = await prisma.puestoEmergencia.findUnique({
    where: { id: puestoId },
    select: { id: true, adminId: true },
  })
  if (!puesto) throw Object.assign(new Error('Puesto no encontrado'), { statusCode: 404 })
  if (puesto.adminId !== adminId) throw Object.assign(new Error('Solo el admin puede eliminar trabajadores'), { statusCode: 403 })

  const registro = await prisma.puestoTrabajador.findUnique({
    where: { puestoId_usuarioId: { puestoId, usuarioId: userId } },
  })
  if (!registro) throw Object.assign(new Error('Trabajador no encontrado en este puesto'), { statusCode: 404 })

  await prisma.puestoTrabajador.delete({
    where: { puestoId_usuarioId: { puestoId, usuarioId: userId } },
  })
}
