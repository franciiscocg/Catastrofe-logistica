import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  getMiAsignacionIncidenciaActiva,
  getIncidencias,
  patchIncidenciaEstado,
  postAsignacionIncidencia,
  postComentarioIncidencia,
  postFinalizarAsignacionIncidencia,
  postIncidencia,
} from './incidencias.controller.js'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'

async function optionalAuth(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.headers.authorization) return

  try {
    await request.jwtVerify()
  } catch {
    // Si el token no es válido, se trata como petición anónima.
  }
}

export async function incidenciasRouter(app: FastifyInstance) {
  app.get('/', getIncidencias)

  app.get('/mis-asignaciones/activa', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, getMiAsignacionIncidenciaActiva)

  app.post('/', { preHandler: optionalAuth }, postIncidencia)

  app.post('/:id/asignaciones', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, postAsignacionIncidencia)

  app.post('/:id/asignaciones/finalizar', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, postFinalizarAsignacionIncidencia)

  app.post('/:id/comentarios', { preHandler: optionalAuth }, postComentarioIncidencia)

  app.patch('/:id/estado', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, patchIncidenciaEstado)
}
