import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import ConnectivityBanner from '@/components/layout/ConnectivityBanner'
import { RealtimeBridge } from '@/hooks/useRealtime'
import { restoreSession } from '@/lib/api/client'
import { router } from '@/router'
import { useAuthStore } from '@/store/auth.store'

export default function App() {
  const isSessionInitialized = useAuthStore((state) => state.isSessionInitialized)

  useEffect(() => {
    void restoreSession()
  }, [])

  if (!isSessionInitialized) {
    return <div className="min-h-screen bg-gray-50" aria-label="Cargando sesion" />
  }

  return (
    <>
      <RealtimeBridge />
      <ConnectivityBanner />
      <RouterProvider router={router} />
    </>
  )
}
