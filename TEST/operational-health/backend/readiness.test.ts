import { describe, expect, it, vi } from 'vitest'
import { checkReadiness } from '../../../backend/src/lib/readiness.js'

function dependencies(databaseError = false, redisResponse: string | Error = 'PONG') {
  return {
    database: {
      $queryRaw: vi.fn().mockImplementation(() => databaseError ? Promise.reject(new Error('db down')) : Promise.resolve([1])),
      pendingChainEvent: { count: vi.fn().mockResolvedValue(3) },
    },
    cache: { ping: vi.fn().mockImplementation(() => redisResponse instanceof Error ? Promise.reject(redisResponse) : Promise.resolve(redisResponse)) },
  }
}

describe('readiness', () => {
  it('está preparado cuando PostgreSQL y Redis responden', async () => {
    const { database, cache } = dependencies()
    const output = await checkReadiness(database as never, cache as never)
    expect(output.ready).toBe(true)
    expect(output.body).toMatchObject({ database: 'ok', redis: 'ok', pendingChainEvents: 3 })
  })

  it('se degrada cuando Redis no está disponible', async () => {
    const { database, cache } = dependencies(false, new Error('redis down'))
    const output = await checkReadiness(database as never, cache as never)
    expect(output.ready).toBe(false)
    expect(output.body).toMatchObject({ database: 'ok', redis: 'unavailable' })
  })

  it('no consulta la cola cuando PostgreSQL falla', async () => {
    const { database, cache } = dependencies(true)
    const output = await checkReadiness(database as never, cache as never)
    expect(output.body).toMatchObject({ database: 'unavailable', redis: 'ok', pendingChainEvents: null })
    expect(database.pendingChainEvent.count).not.toHaveBeenCalled()
  })
})
