import axios from 'axios'
import { useAuthStore } from '@/store/auth.store'
import { clearApiCacheForUser, readApiResponse, saveApiResponse } from '@/lib/db/apiCache'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
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

// El refresh token se guarda en localStorage y se reenvia en el cuerpo de
// /refresh y /logout. Es necesario porque el frontend y el backend estan en
// sitios distintos (Render): la cookie httpOnly de refresh seria de terceros y
// los navegadores la bloquean, cerrando la sesion al recargar.
const REFRESH_TOKEN_STORAGE_KEY = 'catlogistica:refresh-token'

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistRefreshToken(token: string) {
  try {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token)
  } catch {
    // Si el navegador bloquea localStorage seguimos en memoria durante la sesion.
  }
}

function clearStoredRefreshToken() {
  try {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
  } catch {
    /* nada que limpiar si no hay acceso a localStorage */
  }
}

interface SessionResponse {
  user: any
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken?: string
}

export async function clearSensitiveApiCaches() {
  if (!('caches' in globalThis)) return

  await Promise.all(LEGACY_PRIVATE_API_CACHES.map((cacheName) => globalThis.caches.delete(cacheName)))
}

async function refreshAccessToken() {
  refreshPromise ??= apiClient.post<SessionResponse>('/api/auth/refresh', { refreshToken: getStoredRefreshToken() })
    .then(({ data }) => {
      useAuthStore.getState().setSession(data.user, data.accessToken, data.accessTokenExpiresAt)
      return data.accessToken
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export async function restoreSession() {
  const auth = useAuthStore.getState()
  if (!navigator.onLine) {
    auth.restoreOfflineSession()
    return
  }

  try {
    await clearSensitiveApiCaches()
    await refreshAccessToken()
  } catch (error) {
    if (isNetworkError(error)) {
      auth.restoreOfflineSession()
      return
    }
    const userId = auth.user?.id
    if (userId) await clearApiCacheForUser(userId)
    clearStoredRefreshToken()
    auth.logout()
  }
}

export async function endSession() {
  const userId = useAuthStore.getState().user?.id
  try {
    await apiClient.post('/api/auth/logout', { refreshToken: getStoredRefreshToken() })
  } finally {
    clearStoredRefreshToken()
    await clearSensitiveApiCaches()
    if (userId) await clearApiCacheForUser(userId)
    useAuthStore.getState().logout()
  }
}

function isNetworkError(error: unknown) {
  return axios.isAxiosError(error) && (!error.response || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED')
}

apiClient.interceptors.response.use(
  (response) => {
    // Punto unico de captura: si una respuesta de /api/auth/* trae refreshToken,
    // lo guardamos (login, register, registro-puesto y refresh).
    const url = response.config?.url ?? ''
    const token = (response.data as { refreshToken?: string } | undefined)?.refreshToken
    if (token && url.includes('/api/auth/')) persistRefreshToken(token)
    if (response.config.method?.toLowerCase() === 'get') {
      const userId = useAuthStore.getState().user?.id ?? 'public'
      void saveApiResponse(response.config, userId, response.data, response.status)
    }
    return response
  },
  async (error) => {
    const originalRequest = error.config
    if (originalRequest?.method?.toLowerCase() === 'get' && isNetworkError(error)) {
      const userId = useAuthStore.getState().user?.id ?? 'public'
      const cached = await readApiResponse(originalRequest, userId)
      if (cached) {
        return {
          data: cached.data,
          status: cached.status,
          statusText: 'OK (offline cache)',
          headers: { 'x-offline-cache': 'true', 'x-cache-updated-at': String(cached.updatedAt) },
          config: originalRequest,
          request: error.request,
        }
      }
    }
    const isRefreshRequest = originalRequest?.url?.includes('/api/auth/refresh')
    const isAuthenticationRequest = originalRequest?.url?.startsWith('/api/auth/')
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthenticationRequest) {
      originalRequest._retry = true
      let token: string | null = null
      try {
        token = await refreshAccessToken()
      } catch (refreshError) {
        if (isNetworkError(refreshError)) {
          useAuthStore.getState().restoreOfflineSession()
          return Promise.reject(error)
        }
      }
      if (token) {
        originalRequest.headers = originalRequest.headers ?? {}
        originalRequest.headers.Authorization = `Bearer ${token}`
        return apiClient.request(originalRequest)
      }
    }

    if (error.response?.status === 401 && !isRefreshRequest) {
      await clearSensitiveApiCaches()
      clearStoredRefreshToken()
      const userId = useAuthStore.getState().user?.id
      if (userId) await clearApiCacheForUser(userId)
      useAuthStore.getState().logout()
      window.location.href = '/auth/login'
    }
    return Promise.reject(error)
  },
)
