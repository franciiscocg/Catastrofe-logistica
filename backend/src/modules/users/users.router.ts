import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { sanitizeUser } from '../auth/auth.service.js'

function cleanOptionalText(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function usersRouter(app: FastifyInstance) {
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { id: string }).id
    const user = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellidos: true,
        telefono: true,
        roles: true,
        emailVerified: true,
        createdAt: true,
      },
    })

    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' })
    return reply.send({ user: sanitizeUser(user), createdAt: user.createdAt })
  })

  app.patch('/me', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { id: string }).id
    const body = (req.body ?? {}) as { nombre?: unknown; apellidos?: unknown; telefono?: unknown }
    const data: { nombre?: string; apellidos?: string; telefono?: string | null } = {}

    if (typeof body.nombre === 'string') {
      const nombre = body.nombre.trim()
      if (nombre.length < 2) return reply.status(400).send({ error: 'El nombre debe tener al menos 2 caracteres' })
      data.nombre = nombre
    }

    if (typeof body.apellidos === 'string') {
      const apellidos = body.apellidos.trim()
      if (apellidos.length < 2) return reply.status(400).send({ error: 'Los apellidos deben tener al menos 2 caracteres' })
      data.apellidos = apellidos
    }

    const telefono = cleanOptionalText(body.telefono)
    if (telefono !== undefined) data.telefono = telefono

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'No hay cambios para guardar' })
    }

    const user = await prisma.usuario.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        nombre: true,
        apellidos: true,
        telefono: true,
        roles: true,
        emailVerified: true,
      },
    })

    return reply.send({ user: sanitizeUser(user) })
  })
}
