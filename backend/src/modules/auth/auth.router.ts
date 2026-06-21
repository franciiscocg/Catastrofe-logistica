import type { FastifyInstance } from 'fastify'
import { generateRecoveryCode, login, logout, me, refresh, register, requestReset } from './auth.controller.js'
import { requireAuth } from '../../middleware/auth.middleware.js'

export async function authRouter(app: FastifyInstance) {
  app.post('/login', login)
  app.post('/register', register)
  app.post('/refresh', refresh)
  app.post('/logout', logout)
  app.post('/password-reset/request', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, requestReset)
  app.post('/recovery-code', { preHandler: requireAuth }, generateRecoveryCode)
  app.get('/me', { preHandler: requireAuth }, me)
}
