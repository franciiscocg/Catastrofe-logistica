import type { FastifyRequest, FastifyReply } from 'fastify'

type Rol = 'CIUDADANO' | 'VOLUNTARIO' | 'PUESTO_EMERGENCIA' | 'COORDINADOR'

export function requireRole(...roles: Rol[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { roles: Rol[] } | undefined
    if (!user || !roles.some((r) => user.roles.includes(r))) {
      reply.status(403).send({ error: 'No tienes permiso para esta acción' })
    }
  }
}
