import axios from 'axios'
import { useAuthStore } from '@/store/auth.store'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshPromise: Promise<string | null> | null = null
const LEGACY_PRIVATE_API_CACHES = ['api-cache']

interface SessionResponse {
  user: any
  accessToken: string
  accessTokenExpiresAt: string
}

export async function clearSensitiveApiCaches() {
  if (!('caches' in globalThis)) return

  await Promise.all(LEGACY_PRIVATE_API_CACHES.map((cacheName) => globalThis.caches.delete(cacheName)))
}

async function refreshAccessToken() {
  refreshPromise ??= apiClient.post<SessionResponse>('/api/auth/refresh')
    .then(({ data }) => {
      useAuthStore.getState().setSession(data.user, data.accessToken, data.accessTokenExpiresAt)
      return data.accessToken
    })
    .catch(async () => {
      await clearSensitiveApiCaches()
      useAuthStore.getState().logout()
      return null
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export async function restoreSession() {
  await clearSensitiveApiCaches()
  await refreshAccessToken()
}

export async function endSession() {
  try {
    await apiClient.post('/api/auth/logout')
  } finally {
    await clearSensitiveApiCaches()
    useAuthStore.getState().logout()
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const isRefreshRequest = originalRequest?.url?.includes('/api/auth/refresh')
    const isAuthenticationRequest = originalRequest?.url?.startsWith('/api/auth/')
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthenticationRequest) {
      originalRequest._retry = true
      const token = await refreshAccessToken()
      if (token) {
        originalRequest.headers = originalRequest.headers ?? {}
        originalRequest.headers.Authorization = `Bearer ${token}`
        return apiClient.request(originalRequest)
      }
    }

    if (error.response?.status === 401 && !isRefreshRequest) {
      await clearSensitiveApiCaches()
      useAuthStore.getState().logout()
      window.location.href = '/auth/login'
    }
    return Promise.reject(error)
  },
)
