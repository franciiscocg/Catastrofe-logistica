import { prisma } from './lib/prisma.js'
import { redis } from './lib/redis.js'
import { startMaintenanceWorker, stopMaintenanceWorker } from './lib/maintenanceWorker.js'

startMaintenanceWorker()

async function shutdown(signal: string) {
  console.log(`[maintenanceWorker] Recibida ${signal}; cerrando`)
  stopMaintenanceWorker()
  if (redis.status !== 'end') await redis.quit()
  await prisma.$disconnect()
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))
