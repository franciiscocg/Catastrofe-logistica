import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { apiClient } from './client'
import { useSyncStore } from '@/store/sync.store'
import type { SyncPriority } from '@/types/sync.types'

type QueueOptions = {
  entity: string
  priority?: SyncPriority
  localEntityId?: string
  optimisticData?: unknown
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

  const execute = () => {
    if (method === 'POST') return apiClient.post<T>(config.url!, config.data)
    if (method === 'PUT') return apiClient.put<T>(config.url!, config.data)
    if (method === 'PATCH') return apiClient.patch<T>(config.url!, config.data)
    return config.data === undefined
      ? apiClient.delete<T>(config.url!)
      : apiClient.delete<T>(config.url!, { data: config.data })
  }

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
  })

  return {
    data: (options.optimisticData ?? { offlineQueued: true }) as T,
    status: 202,
    statusText: 'Accepted offline',
    headers: { 'x-offline-queued': 'true' },
    config: config as AxiosResponse<T>['config'],
  }
}
