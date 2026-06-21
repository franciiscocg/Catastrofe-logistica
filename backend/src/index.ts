import 'dotenv/config'
import { buildApp } from './app.js'
import { initRealtime } from './lib/realtime.js'
import { startChainWorker } from './lib/chainWorker.js'
import { startMaintenanceWorker } from './lib/maintenanceWorker.js'

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const HOST = process.env.HOST ?? '0.0.0.0'

async function main() {
  const app = await buildApp()
  initRealtime(app.server, (token) => app.jwt.verify(token))
  try {
    await app.listen({ port: PORT, host: HOST })
    startChainWorker()
    startMaintenanceWorker()
    console.log(`🚀 API escuchando en http://${HOST}:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
