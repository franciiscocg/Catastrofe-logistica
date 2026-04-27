import type { FastifyInstance } from 'fastify'
import { login, register, me } from './auth.controller.js'
import { requireAuth } from '../../middleware/auth.middleware.js'

export async function authRouter(app: FastifyInstance) {
  app.post('/login', login)
  app.post('/register', register)
  app.get('/me', { preHandler: requireAuth }, me)
}
