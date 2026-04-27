import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import type {
  CreateIncidenciaInput,
  ListIncidenciasQuery,
  UpdateEstadoInput,
} from './incidencias.schema.js'

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
    },
  })
}

export async function createIncidencia(input: CreateIncidenciaInput, reportanteId?: string) {
  const catastrofe = await prisma.catastrofe.findUnique({
    where: { id: input.catastrofeId },
    select: { id: true },
  })

  if (!catastrofe) {
    const error = new Error('Catástrofe no encontrada') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }

  return prisma.incidenciaVia.create({
    data: {
      catastrofeId: input.catastrofeId,
      reportanteId,
      latitud: input.latitud,
      longitud: input.longitud,
      estado: input.estado,
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
