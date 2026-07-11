import { describe, expect, it, vi } from 'vitest'
import { withDistributedLock } from '../../../backend/src/lib/distributedLock.js'

describe('bloqueo distribuido', () => {
  it('ejecuta y libera la operación cuando adquiere el bloqueo', async () => {
    const client = { set: vi.fn().mockResolvedValue('OK'), eval: vi.fn().mockResolvedValue(1) }
    const operation = vi.fn().mockResolvedValue(7)
    await expect(withDistributedLock('worker:test', 1_000, operation, client as never))
      .resolves.toEqual({ acquired: true, value: 7 })
    expect(operation).toHaveBeenCalledOnce()
    expect(client.eval).toHaveBeenCalledWith(expect.any(String), 1, 'worker:test', expect.any(String))
  })

  it('no ejecuta cuando otra réplica conserva el bloqueo', async () => {
    const client = { set: vi.fn().mockResolvedValue(null), eval: vi.fn() }
    const operation = vi.fn()
    await expect(withDistributedLock('worker:test', 1_000, operation, client as never))
      .resolves.toEqual({ acquired: false })
    expect(operation).not.toHaveBeenCalled()
    expect(client.eval).not.toHaveBeenCalled()
  })

  it('libera el bloqueo aunque la operación falle', async () => {
    const client = { set: vi.fn().mockResolvedValue('OK'), eval: vi.fn().mockResolvedValue(1) }
    await expect(withDistributedLock('worker:test', 1_000, async () => { throw new Error('fallo') }, client as never))
      .rejects.toThrow('fallo')
    expect(client.eval).toHaveBeenCalledOnce()
  })
})
