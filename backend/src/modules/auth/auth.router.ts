import type { FastifyInstance } from 'fastify'
import { login, logout, me, refresh, register, requestReset, resendVerification, reset, verify } from './auth.controller.js'
import { requireAuth } from '../../middleware/auth.middleware.js'

export async function authRouter(app: FastifyInstance) {
  app.post('/login', login)
  app.post('/register', register)
  app.post('/refresh', refresh)
  app.post('/logout', logout)
  app.post('/verify-account', verify)
  app.post('/verify-account/resend', resendVerification)
  app.post('/password-reset/request', requestReset)
  app.post('/password-reset/confirm', reset)
  app.get('/me', { preHandler: requireAuth }, me)
}
