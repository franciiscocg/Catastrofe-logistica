import { RouterProvider } from 'react-router-dom'
import ConnectivityBanner from '@/components/layout/ConnectivityBanner'
import LocationPermissionBanner from '@/components/layout/LocationPermissionBanner'
import { RealtimeBridge } from '@/hooks/useRealtime'
import { router } from '@/router'

export default function App() {
  return (
    <>
      <RealtimeBridge />
      <ConnectivityBanner />
      <RouterProvider router={router} />
      <LocationPermissionBanner />
    </>
  )
}
