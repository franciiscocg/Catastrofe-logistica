import axios from 'axios'
import { useAuthStore } from '@/store/auth.store'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken() {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) return null

  refreshPromise ??= apiClient.post<{
    user: any
    accessToken: string
    refreshToken: string
    accessTokenExpiresAt: string
  }>('/api/auth/refresh', { refreshToken })
    .then(({ data }) => {
      useAuthStore.getState().setSession(data.user, data.accessToken, data.refreshToken, data.accessTokenExpiresAt)
      return data.accessToken
    })
    .catch(() => {
      useAuthStore.getState().logout()
      return null
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !originalRequest.url?.includes('/api/auth/refresh')) {
      originalRequest._retry = true
      const token = await refreshAccessToken()
      if (token) {
        originalRequest.headers = originalRequest.headers ?? {}
        originalRequest.headers.Authorization = `Bearer ${token}`
        return apiClient.request(originalRequest)
      }
    }

    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/auth/login'
    }
    return Promise.reject(error)
  },
)
