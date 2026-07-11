import { buildApp } from './app.js'
import { initRealtime } from './lib/realtime.js'
import { env } from './config/env.js'

const { PORT, HOST } = env

async function main() {
  const app = await buildApp()
  initRealtime(app.server, (token) => app.jwt.verify(token))
  try {
    await app.listen({ port: PORT, host: HOST })
    console.log(`🚀 API escuchando en http://${HOST}:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
