import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { GeolocationProvider } from './hooks/useGeolocation'
import { registerSW } from './lib/sw/register'
import { initLocalRouting } from './utils/osmGraphStore'
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

// Carga el grafo de calles local para enrutamiento offline (si hay extracto).
// No bloquea el arranque: en segundo plano registra el enrutador local.
void initLocalRouting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <GeolocationProvider>
        <App />
      </GeolocationProvider>
    </QueryClientProvider>
  </StrictMode>,
)
