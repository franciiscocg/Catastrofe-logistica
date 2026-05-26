import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let server: Server
let port = 0
let lastBody = Buffer.alloc(0)

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      lastBody = Buffer.concat(chunks)
      res.writeHead(200, { 'Content-Type': 'application/timestamp-reply' })
      res.end(Buffer.from([0x30, 0x07, 0x30, 0x03, 0x02, 0x01, 0x00, 0x30, 0x00]))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No se pudo iniciar TSA de prueba')
  port = address.port
  process.env.TSA_URL = `http://127.0.0.1:${port}/tsr`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  delete process.env.TSA_URL
})

describe('sellado de tiempo', () => {
  it('solicita el sello para el hash SHA-256 de la cadena sin volver a hashearlo', async () => {
    const { timestampHash } = await import('../../../backend/src/lib/tsa.js')
    const hash = 'ab'.repeat(32)

    const result = await timestampHash(hash)

    expect(result.token).toBeTruthy()
    expect(lastBody.includes(Buffer.from(hash, 'hex'))).toBe(true)
  })

  it('rechaza entradas que no son hashes SHA-256', async () => {
    const { timestampHash } = await import('../../../backend/src/lib/tsa.js')
    await expect(timestampHash('contenido sin hash')).rejects.toThrow('Invalid SHA-256 hash')
  })
})
