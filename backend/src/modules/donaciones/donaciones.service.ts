import type { EstadoDonacion } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../lib/prisma.js'
import type { CreateDonacionInput } from './donaciones.schema.js'

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 })
}

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 })
}

async function getVoluntarioByUsuario(usuarioId: string) {
  const voluntario = await prisma.voluntario.findUnique({
    where: { usuarioId },
    select: { id: true },
  })

  if (!voluntario) throw badRequest('El usuario no tiene perfil de voluntario')
  return voluntario
}

export async function listNecesidadesDonacion() {
  const necesidades = await prisma.inventario.findMany({
    where: {
      tipo: 'NECESARIO',
      puesto: { activo: true },
      cantidad: { gt: 0 },
    },
    orderBy: [
      { puesto: { nombre: 'asc' } },
      { producto: { nombre: 'asc' } },
    ],
    include: {
      producto: true,
      puesto: {
        select: {
          id: true,
          nombre: true,
          direccion: true,
          latitud: true,
          longitud: true,
          tipo: true,
          activo: true,
          catastrofeId: true,
        },
      },
    },
  })

  const comprometidas = await prisma.donacion.groupBy({
    by: ['puestoId', 'productoId'],
    where: {
      estado: { in: ['PENDIENTE', 'EN_CAMINO'] },
    },
    _sum: { cantidad: true },
  })

  const comprometidasMap = new Map(
    comprometidas.map((item) => [`${item.puestoId}:${item.productoId}`, item._sum.cantidad ?? 0]),
  )

  return necesidades.map((item) => {
    const cantidadComprometida = comprometidasMap.get(`${item.puestoId}:${item.productoId}`) ?? 0
    const cantidadPendiente = Math.max(item.cantidad - cantidadComprometida, 0)

    return {
      id: item.id,
      puesto: item.puesto,
      producto: item.producto,
      cantidadNecesaria: item.cantidad,
      cantidadComprometida,
      cantidadPendiente,
      unidad: item.producto.unidad,
      prioridad: cantidadPendiente <= 0 ? 'cubierta' : cantidadPendiente <= item.cantidad * 0.3 ? 'baja' : 'alta',
      updatedAt: item.updatedAt,
    }
  }).filter((item) => item.cantidadPendiente > 0)
}

export async function createDonacion(usuarioId: string, input: CreateDonacionInput) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  const necesidad = await prisma.inventario.findFirst({
    where: {
      puestoId: input.puestoId,
      productoId: input.productoId,
      tipo: 'NECESARIO',
      puesto: { activo: true },
    },
    include: { producto: true, puesto: true },
  })

  if (!necesidad) throw notFound('Necesidad no encontrada para este puesto')

  const comprometida = await prisma.donacion.aggregate({
    where: {
      puestoId: input.puestoId,
      productoId: input.productoId,
      estado: { in: ['PENDIENTE', 'EN_CAMINO'] },
    },
    _sum: { cantidad: true },
  })
  const cantidadComprometida = comprometida._sum.cantidad ?? 0
  const cantidadPendiente = Math.max(necesidad.cantidad - cantidadComprometida, 0)

  if (cantidadPendiente <= 0) {
    throw badRequest('Esta necesidad ya esta cubierta por otras donaciones en camino')
  }

  if (input.cantidad > cantidadPendiente) {
    throw badRequest(`La cantidad supera lo pendiente. Quedan ${cantidadPendiente} ${necesidad.producto.unidad}`)
  }

  return prisma.donacion.create({
    data: {
      voluntarioId: voluntario.id,
      puestoId: input.puestoId,
      productoId: input.productoId,
      cantidad: input.cantidad,
      unidad: input.unidad,
      comentario: input.comentario,
      eta: input.eta ? new Date(input.eta) : undefined,
    },
    include: {
      producto: true,
      puesto: true,
    },
  })
}

export async function listMisDonaciones(usuarioId: string) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  return prisma.donacion.findMany({
    where: { voluntarioId: voluntario.id },
    orderBy: { createdAt: 'desc' },
    include: {
      producto: true,
      puesto: true,
    },
  })
}

export async function updateDonacionEstado(usuarioId: string, donacionId: string, estado: EstadoDonacion) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  const donacion = await prisma.donacion.findFirst({
    where: { id: donacionId, voluntarioId: voluntario.id },
    select: { id: true },
  })

  if (!donacion) throw notFound('Donacion no encontrada')

  return prisma.donacion.update({
    where: { id: donacionId },
    data: { estado },
    include: {
      producto: true,
      puesto: true,
    },
  })
}

export async function generarCodigoEntrega(usuarioId: string, donacionId: string) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  const donacion = await prisma.donacion.findFirst({
    where: { id: donacionId, voluntarioId: voluntario.id },
    include: {
      producto: true,
      puesto: true,
    },
  })

  if (!donacion) throw notFound('Donacion no encontrada')
  if (donacion.estado !== 'EN_CAMINO') {
    throw badRequest('Solo puedes generar el codigo cuando la donacion esta en camino')
  }

  if (donacion.entregaCodigo) {
    return donacion
  }

  return prisma.donacion.update({
    where: { id: donacionId },
    data: {
      entregaCodigo: `DEL-${randomUUID()}`,
      entregaCodigoGeneradoAt: new Date(),
    },
    include: {
      producto: true,
      puesto: true,
    },
  })
}
