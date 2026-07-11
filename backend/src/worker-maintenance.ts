import { prisma } from './lib/prisma.js'
import { startMaintenanceWorker, stopMaintenanceWorker } from './lib/maintenanceWorker.js'

startMaintenanceWorker()

async function shutdown(signal: string) {
  console.log(`[maintenanceWorker] Recibida ${signal}; cerrando`)
  stopMaintenanceWorker()
  await prisma.$disconnect()
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))
