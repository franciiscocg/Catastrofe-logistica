import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'
import { prisma } from '../../lib/prisma.js'

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

// TODO: Implementar en Mes 2
export async function catastrofesRouter(app: FastifyInstance) {
  app.get('/', async (_req, reply) => {
    reply.send({ catastrofes: [] })
  })

  app.get('/resolver-activa', async (req, reply) => {
    const { latitud, longitud } = req.query as { latitud?: string; longitud?: string }
    const lat = Number(latitud)
    const lng = Number(longitud)

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return reply.status(400).send({ error: 'latitud y longitud son obligatorias' })
    }

    const activas = await prisma.catastrofe.findMany({
      where: { activa: true },
      select: {
        id: true,
        nombre: true,
        fase: true,
        latitud: true,
        longitud: true,
        radio: true,
      },
    })

    const candidatas = activas
      .map((catastrofe) => ({
        ...catastrofe,
        distanciaKm: haversineKm(lat, lng, catastrofe.latitud, catastrofe.longitud),
      }))
      .filter((catastrofe) => catastrofe.distanciaKm <= catastrofe.radio)
      .sort((a, b) => a.distanciaKm - b.distanciaKm)
      .map((catastrofe) => ({
        id: catastrofe.id,
        nombre: catastrofe.nombre,
        fase: catastrofe.fase,
        distanciaKm: Number(catastrofe.distanciaKm.toFixed(3)),
      }))

    return reply.send({
      catastrofe: candidatas[0] ?? null,
      candidatas,
    })
  })

  app.post('/', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (_req, reply) => {
    reply.status(201).send({ message: 'Pendiente de implementar' })
  })
}
