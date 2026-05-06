import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { GeolocationProvider } from './hooks/useGeolocation'
import { registerSW } from './lib/sw/register'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: (failureCount) => {
        // No reintentar si estamos offline
        if (!navigator.onLine) return false
        return failureCount < 2
      },
    },
  },
})

registerSW()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <GeolocationProvider>
        <App />
      </GeolocationProvider>
    </QueryClientProvider>
  </StrictMode>,
)
