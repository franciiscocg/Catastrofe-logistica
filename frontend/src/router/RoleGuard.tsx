import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { Role } from '@/types/auth.types'

interface RoleGuardProps {
  allowedRole: Role
  children: React.ReactNode
}

export default function RoleGuard({ allowedRole, children }: RoleGuardProps) {
  const { puestoId, selectedRole, selectRole, user } = useAuthStore()
  const location = useLocation()

  const roles = user?.roles ?? []
  const hasRole = (role: string) => roles.includes(role)
  const canAccess =
    allowedRole === Role.CIUDADANO
      ? hasRole('CIUDADANO')
      : allowedRole === Role.VOLUNTARIO
        ? hasRole('VOLUNTARIO')
        : allowedRole === Role.COORDINADOR
          ? hasRole('COORDINADOR')
          : hasRole('PUESTO_EMERGENCIA')

  if (!canAccess) {
    return <Navigate to="/seleccionar-rol" state={{ from: location }} replace />
  }

  if (allowedRole === Role.PUESTO && !puestoId) {
    return <Navigate to="/auth/registro-puesto" state={{ from: location }} replace />
  }

  if (selectedRole !== allowedRole) {
    selectRole(allowedRole)
  }

  return <>{children}</>
}
