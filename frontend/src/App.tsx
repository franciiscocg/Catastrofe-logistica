import { RouterProvider } from 'react-router-dom'
import ConnectivityBanner from '@/components/layout/ConnectivityBanner'
import LocationPermissionBanner from '@/components/layout/LocationPermissionBanner'
import { router } from '@/router'

export default function App() {
  return (
    <>
      <ConnectivityBanner />
      <RouterProvider router={router} />
      <LocationPermissionBanner />
    </>
  )
}
