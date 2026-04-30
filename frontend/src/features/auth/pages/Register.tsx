import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ROLE_LABELS, Role } from '@/types/auth.types'
import Button from '@/components/ui/Button'
import RegisterPuesto from './RegisterPuesto'

export default function Register() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const roleParam = params.get('role') as Role | null
  const roleLabel = roleParam ? ROLE_LABELS[roleParam] : null

  // Formularios específicos por rol
  if (roleParam === Role.PUESTO) return <RegisterPuesto />

  // Stub genérico para los demás roles (a implementar en Mes 2)
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center px-4">
      <div className="max-w-sm mx-auto w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Crear cuenta</h1>
        {roleLabel && (
          <p className="text-sm text-gray-500 mb-6">
            Registro como <strong>{roleLabel}</strong>
          </p>
        )}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 mb-6">
          Formulario de registro pendiente de implementar (Mes 2 del roadmap)
        </div>
        <Button onClick={() => navigate(-1)} variant="secondary" fullWidth>
          Volver
        </Button>
        <p className="mt-4 text-sm text-gray-500">
          ¿Ya tienes cuenta?{' '}
          <Link to={`/auth/login${roleParam ? `?role=${roleParam}` : ''}`} className="text-blue-600 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
