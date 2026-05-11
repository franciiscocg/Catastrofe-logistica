import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import AppShell from '@/components/layout/AppShell'
import RoleGuard from './RoleGuard'
import AuthGuard from './AuthGuard'
import { Role } from '@/types/auth.types'

const RoleSelection = lazy(() => import('@/features/auth/pages/RoleSelection'))
const Login = lazy(() => import('@/features/auth/pages/Login'))
const Register = lazy(() => import('@/features/auth/pages/Register'))
const RegisterPuesto = lazy(() => import('@/features/auth/pages/RegisterPuesto'))
const RegisterSuccess = lazy(() => import('@/features/auth/pages/RegisterSuccess'))

const CiudadanoDashboard = lazy(() => import('@/features/ciudadano/pages/Dashboard'))
const VoluntarioDashboard = lazy(() => import('@/features/voluntario/pages/Dashboard'))
const PuestoDashboard = lazy(() => import('@/features/puesto/pages/Dashboard'))
const CoordinadorDashboard = lazy(() => import('@/features/coordinador/pages/Dashboard'))

const Loading = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
  </div>
)

const roleSelectionElement = (
  <Suspense fallback={<Loading />}>
    <RoleSelection />
  </Suspense>
)

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AuthGuard>{roleSelectionElement}</AuthGuard>,
  },
  {
    path: '/seleccionar-rol',
    element: <AuthGuard>{roleSelectionElement}</AuthGuard>,
  },
  {
    path: '/auth',
    children: [
      {
        path: 'login',
        element: (
          <Suspense fallback={<Loading />}>
            <Login />
          </Suspense>
        ),
      },
      {
        path: 'register',
        element: (
          <Suspense fallback={<Loading />}>
            <Register />
          </Suspense>
        ),
      },
      {
        path: 'registro-puesto',
        element: (
          <Suspense fallback={<Loading />}>
            <RegisterPuesto />
          </Suspense>
        ),
      },
      {
        path: 'registro-exitoso',
        element: (
          <Suspense fallback={<Loading />}>
            <RegisterSuccess />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/ciudadano',
    element: (
      <AuthGuard>
        <RoleGuard allowedRole={Role.CIUDADANO}>
          <AppShell />
        </RoleGuard>
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<Loading />}>
            <CiudadanoDashboard />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/voluntario',
    element: (
      <AuthGuard>
        <RoleGuard allowedRole={Role.VOLUNTARIO}>
          <AppShell />
        </RoleGuard>
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<Loading />}>
            <VoluntarioDashboard />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/puesto',
    element: (
      <AuthGuard>
        <RoleGuard allowedRole={Role.PUESTO}>
          <AppShell />
        </RoleGuard>
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<Loading />}>
            <PuestoDashboard />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/coordinador',
    element: (
      <AuthGuard>
        <RoleGuard allowedRole={Role.COORDINADOR}>
          <AppShell />
        </RoleGuard>
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<Loading />}>
            <CoordinadorDashboard />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
