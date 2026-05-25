import { prisma } from '../../lib/prisma.js'
import { verifyChain } from '../../lib/chain.js'

export async function getEventsByEntidad(entidad: string, entidadId: string) {
  return prisma.chainEvent.findMany({
    where: { entidad, entidadId },
    orderBy: { sequence: 'asc' },
    select: {
      id: true,
      sequence: true,
      tipo: true,
      actorRol: true,
      entidad: true,
      entidadId: true,
      payload: true,
      hashPrevio: true,
      hashPropio: true,
      tsaTimestamp: true,
      createdAt: true,
    },
  })
}

export async function getEventById(id: string) {
  return prisma.chainEvent.findUnique({
    where: { id },
    select: {
      id: true,
      sequence: true,
      tipo: true,
      actorRol: true,
      entidad: true,
      entidadId: true,
      payload: true,
      hashPrevio: true,
      hashPropio: true,
      tsaToken: true,
      tsaTimestamp: true,
      createdAt: true,
    },
  })
}

export async function getRecentEvents(limit = 50) {
  return prisma.chainEvent.findMany({
    orderBy: { sequence: 'desc' },
    take: limit,
    select: {
      id: true,
      sequence: true,
      tipo: true,
      actorRol: true,
      entidad: true,
      entidadId: true,
      payload: true,
      hashPropio: true,
      tsaTimestamp: true,
      createdAt: true,
    },
  })
}

export async function getChainStats() {
  const [total, withTSA, latest] = await Promise.all([
    prisma.chainEvent.count(),
    prisma.chainEvent.count({ where: { tsaTimestamp: { not: null } } }),
    prisma.chainEvent.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true, hashPropio: true, createdAt: true },
    }),
  ])
  return { total, withTSA, latestSequence: latest?.sequence ?? 0, latestHash: latest?.hashPropio ?? null }
}

export { verifyChain }
