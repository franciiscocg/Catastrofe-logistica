import { beforeEach, describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => ({
  getEventsByEntidad: vi.fn(),
  getEventById: vi.fn(),
  getRecentEvents: vi.fn(),
  getChainStats: vi.fn(),
  verifyChain: vi.fn(),
}))

vi.mock('../../../backend/src/modules/audit/audit.service.js', () => service)

import { auditRouter } from '../../../backend/src/modules/audit/audit.router.js'

async function buildAuditApp() {
  const routes = new Map<string, (req: any, reply: any) => Promise<unknown>>()
  const app = {
    get(path: string, handler: (req: any, reply: any) => Promise<unknown>) {
      routes.set(path, handler)
    },
  }
  await auditRouter(app as any)
  return routes
}

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    send(body: unknown) {
      this.body = body
      return body
    },
  }
}

describe('API publica de auditoria', () => {
  beforeEach(() => vi.clearAllMocks())

  it('publica estadisticas y resultado de integridad', async () => {
    service.getChainStats.mockResolvedValue({ total: 2, withTSA: 1, latestSequence: 2, latestHash: 'hash' })
    service.verifyChain.mockResolvedValue({ valid: true, totalEvents: 2 })
    const routes = await buildAuditApp()
    const statsReply = createReply()
    const verifyReply = createReply()

    await routes.get('/stats')!({}, statsReply)
    await routes.get('/verify')!({}, verifyReply)
    expect(statsReply.body).toMatchObject({ total: 2 })
    expect(verifyReply.body).toEqual({ valid: true, totalEvents: 2 })
  })

  it('devuelve 404 cuando una donación no tiene eventos', async () => {
    service.getEventsByEntidad.mockResolvedValue([])
    const routes = await buildAuditApp()
    const reply = createReply()

    await routes.get('/donacion/:id')!({ params: { id: 'desconocida' } }, reply)

    expect(reply.statusCode).toBe(404)
  })
})
