import { randomUUID } from 'node:crypto'
import type Redis from 'ioredis'
import { redis } from './redis.js'

const RELEASE_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
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

  try {
    return { acquired: true, value: await operation() }
  } finally {
    await client.eval(RELEASE_SCRIPT, 1, key, owner)
  }
}
