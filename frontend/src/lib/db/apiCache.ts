import type { AxiosRequestConfig } from 'axios'
import { db } from './index'

function stableParams(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return `[${value.map(stableParams).join(',')}]`
  return Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${key}:${stableParams(item)}`)
    .join('|')
}

export function apiCacheKey(config: AxiosRequestConfig, userId: string) {
  return `${userId}:GET:${config.url ?? ''}?${stableParams(config.params)}`
}

export async function saveApiResponse(config: AxiosRequestConfig, userId: string, data: unknown, status: number) {
  if (!config.url || config.url.startsWith('/api/auth/')) return
  await db.apiCache.put({ key: apiCacheKey(config, userId), userId, data, status, updatedAt: Date.now() })
  const entries = await db.apiCache.where('userId').equals(userId).sortBy('updatedAt')
  const expiredBefore = Date.now() - 30 * 24 * 60 * 60 * 1000
  const removable = entries.filter((entry, index) => entry.updatedAt < expiredBefore || index < entries.length - 150)
  if (removable.length) await db.apiCache.bulkDelete(removable.map((entry) => entry.key))
}

export async function readApiResponse(config: AxiosRequestConfig, userId: string) {
  return db.apiCache.get(apiCacheKey(config, userId))
}

export async function clearApiCacheForUser(userId: string) {
  await db.apiCache.where('userId').equals(userId).delete()
}
