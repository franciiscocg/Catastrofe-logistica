import type { FastifyRequest, FastifyReply } from 'fastify'
import { loginSchema, registerSchema } from './auth.schema.js'
import { loginUser, registerUser } from './auth.service.js'

export async function login(request: FastifyRequest, reply: FastifyReply) {
  const input = loginSchema.parse(request.body)
  const user = await loginUser(input)

  const accessToken = await reply.jwtSign(
    { sub: user.id, email: user.email, roles: user.roles },
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' },
  )

  return reply.send({ user, accessToken })
}

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const input = registerSchema.parse(request.body)
  const user = await registerUser(input)

  const accessToken = await reply.jwtSign(
    { sub: user.id, email: user.email, roles: user.roles },
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' },
  )

  return reply.status(201).send({ user, accessToken })
}

export async function me(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ user: request.user })
}
