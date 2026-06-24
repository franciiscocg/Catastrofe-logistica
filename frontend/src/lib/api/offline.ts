import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { apiClient } from './client'
import { useSyncStore } from '@/store/sync.store'
import type { SyncPriority } from '@/types/sync.types'

type QueueOptions = {
  entity: string
  priority?: SyncPriority
  localEntityId?: string
  optimisticData?: unknown
  idempotencyKey?: string
}

function isNetworkFailure(error: unknown) {
  return axios.isAxiosError(error) && (!error.response || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED')
}

export async function queueableApiRequest<T = unknown>(
  config: AxiosRequestConfig,
  options: QueueOptions,
): Promise<AxiosResponse<T>> {
  const method = config.method?.toUpperCase() as 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  if (!method || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !config.url) {
    return apiClient.request<T>(config)
  }

  const idempotencyKey = options.idempotencyKey ?? `offline-${crypto.randomUUID()}`
  const execute = () => apiClient.request<T>({
    ...config,
    method,
    url: config.url,
    data: config.data,
    headers: {
      ...config.headers,
      'Idempotency-Key': idempotencyKey,
    },
  })

  if (navigator.onLine) {
    try {
      return await execute()
    } catch (error) {
      if (!isNetworkFailure(error)) throw error
    }
  }

  await useSyncStore.getState().enqueue({
    entity: options.entity,
    method,
    url: config.url,
    body: config.data,
    priority: options.priority ?? 'normal',
    localEntityId: options.localEntityId,
    idempotencyKey,
  })

  return {
    data: (options.optimisticData ?? { offlineQueued: true }) as T,
    status: 202,
    statusText: 'Accepted offline',
    headers: { 'x-offline-queued': 'true' },
    config: config as AxiosResponse<T>['config'],
  }
}
