import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import type {
  CreateIncidenciaInput,
  CreateComentarioIncidenciaInput,
  ListIncidenciasQuery,
  UpdateEstadoInput,
} from './incidencias.schema.js'

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return 6371 * c
}

async function resolveCatastrofeId(input: CreateIncidenciaInput) {
  if (input.catastrofeId) {
    const catastrofe = await prisma.catastrofe.findUnique({
      where: { id: input.catastrofeId },
      select: { id: true },
    })

    if (!catastrofe) {
      const error = new Error('Catástrofe no encontrada') as Error & { statusCode?: number }
      error.statusCode = 404
      throw error
    }

    return catastrofe.id
  }

  const activas = await prisma.catastrofe.findMany({
    where: { activa: true },
    select: { id: true, latitud: true, longitud: true, radio: true },
  })

  const candidatas = activas
    .map((catastrofe) => ({
      ...catastrofe,
      distanciaKm: haversineKm(input.latitud, input.longitud, catastrofe.latitud, catastrofe.longitud),
    }))
    .filter((catastrofe) => catastrofe.distanciaKm <= catastrofe.radio)
    .sort((a, b) => a.distanciaKm - b.distanciaKm)

  if (candidatas.length === 0) {
    const error = new Error('No hay una catástrofe activa para ese punto') as Error & { statusCode?: number }
    error.statusCode = 400
    throw error
  }

  return candidatas[0].id
}

async function assertNotDuplicateIncidencia(input: CreateIncidenciaInput, catastrofeId: string) {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const recientes = await prisma.incidenciaVia.findMany({
    where: {
      catastrofeId,
      estado: 'CORTADA',
      createdAt: { gte: twoHoursAgo },
    },
    select: {
      id: true,
      latitud: true,
      longitud: true,
      estado: true,
      descripcion: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const duplicate = recientes.find((incidencia) => {
    const distanceKm = haversineKm(input.latitud, input.longitud, incidencia.latitud, incidencia.longitud)
    return distanceKm <= 0.05
  })

  if (duplicate) {
    const error = new Error('Ya existe una incidencia similar muy cerca en las últimas 2 horas') as Error & {
      statusCode?: number
      duplicateIncidencia?: {
        id: string
        latitud: number
        longitud: number
        estado: 'CORTADA' | 'TRANSITABLE'
        descripcion: string | null
        createdAt: Date
      }
    }
    error.statusCode = 409
    error.duplicateIncidencia = duplicate
    throw error
  }
}

export async function listIncidencias(query: ListIncidenciasQuery) {
  const where: Prisma.IncidenciaViaWhereInput = {
    ...(query.catastrofeId ? { catastrofeId: query.catastrofeId } : {}),
    ...(query.estado ? { estado: query.estado } : {}),
  }

  return prisma.incidenciaVia.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      reportante: {
        select: { id: true, nombre: true, apellidos: true },
      },
      comentarios: {
        orderBy: { createdAt: 'desc' },
        include: {
          autor: {
            select: { id: true, nombre: true, apellidos: true },
          },
        },
      },
      _count: {
        select: { comentarios: true },
      },
    },
  })
}

export async function createIncidencia(input: CreateIncidenciaInput, reportanteId?: string) {
  const catastrofeId = await resolveCatastrofeId(input)
  if (!input.force) {
    await assertNotDuplicateIncidencia(input, catastrofeId)
  }

  return prisma.incidenciaVia.create({
    data: {
      catastrofeId,
      reportanteId,
      latitud: input.latitud,
      longitud: input.longitud,
      estado: 'CORTADA',
      descripcion: input.descripcion,
    },
  })
}

export async function updateIncidenciaEstado(id: string, input: UpdateEstadoInput) {
  const exists = await prisma.incidenciaVia.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!exists) {
    const error = new Error('Incidencia no encontrada') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }

  return prisma.incidenciaVia.update({
    where: { id },
    data: { estado: input.estado },
  })
}

export async function createComentarioIncidencia(
  incidenciaId: string,
  input: CreateComentarioIncidenciaInput,
  autorId?: string,
) {
  const exists = await prisma.incidenciaVia.findUnique({
    where: { id: incidenciaId },
    select: { id: true },
  })

  if (!exists) {
    const error = new Error('Incidencia no encontrada') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }

  return prisma.$transaction(async (tx) => {
    const comentario = await tx.comentarioIncidenciaVia.create({
      data: {
        incidenciaId,
        autorId,
        estado: input.estado,
        comentario: input.comentario,
      },
      include: {
        autor: {
          select: { id: true, nombre: true, apellidos: true },
        },
      },
    })

    const incidencia = await tx.incidenciaVia.update({
      where: { id: incidenciaId },
      data: { estado: input.estado },
    })

    return { comentario, incidencia }
  })
}
