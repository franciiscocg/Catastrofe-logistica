import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma.js'
import { redis } from '../src/lib/redis.js'
import { loginUser, registerUser } from '../src/modules/auth/auth.service.js'

async function main() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const email = `integration-${suffix}@example.test`
  const dni = `IT${suffix.toUpperCase()}`
  const password = 'Integration123!'

  await prisma.$queryRaw`SELECT 1`
  if (await redis.ping() !== 'PONG') throw new Error('Redis no respondió con PONG')

  try {
    const created = await registerUser({
      email,
      dni,
      password,
      nombre: 'Prueba',
      apellidos: 'Integración',
    })
    const authenticated = await loginUser({ identifier: email, password })
    if (authenticated.id !== created.user.id) throw new Error('El login no devolvió el usuario creado')
  } finally {
    await prisma.usuario.deleteMany({ where: { email } })
    await redis.quit()
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
