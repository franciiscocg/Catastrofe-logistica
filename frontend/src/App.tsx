import { RouterProvider } from 'react-router-dom'
import LocationPermissionBanner from '@/components/layout/LocationPermissionBanner'
import { router } from '@/router'

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <LocationPermissionBanner />
    </>
  )
}
