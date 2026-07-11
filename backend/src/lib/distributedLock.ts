import { randomUUID } from 'node:crypto'
import type Redis from 'ioredis'
import { redis } from './redis.js'

const RELEASE_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`

const EXTEND_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('pexpire', KEYS[1], ARGV[2])
  end
  return 0
`

export async function withDistributedLock<T>(
  key: string,
  ttlMs: number,
  operation: () => Promise<T>,
  client: Pick<Redis, 'set' | 'eval'> = redis,
): Promise<{ acquired: boolean; value?: T }> {
  const owner = randomUUID()
  const acquired = await client.set(key, owner, 'PX', ttlMs, 'NX')
  if (acquired !== 'OK') return { acquired: false }

  const renewalTimer = setInterval(() => {
    void client.eval(EXTEND_SCRIPT, 1, key, owner, ttlMs).catch((error: unknown) => {
      console.error(`[lock] No se pudo renovar ${key}:`, error)
    })
  }, Math.max(1_000, Math.floor(ttlMs / 3)))
  renewalTimer.unref?.()

  try {
    return { acquired: true, value: await operation() }
  } finally {
    clearInterval(renewalTimer)
    await client.eval(RELEASE_SCRIPT, 1, key, owner)
  }
}
