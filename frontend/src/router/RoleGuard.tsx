import { useAuthStore } from '@/store/auth.store'
import { Role } from '@/types/auth.types'

interface RoleGuardProps {
  allowedRole: Role
  children: React.ReactNode
}

export default function RoleGuard({ allowedRole, children }: RoleGuardProps) {
  const { selectedRole, selectRole } = useAuthStore()

  if (selectedRole !== allowedRole) {
    selectRole(allowedRole)
  }

  return <>{children}</>
}
